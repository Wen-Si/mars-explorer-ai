#!/usr/bin/env python3
"""
Mars AI Research Engine
Generates novel scientific questions about Mars and research reports using MiniMax M3 (via NVIDIA API).
This script is used both for initial seeding and by GitHub Actions for ongoing generation.
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

API_KEY = os.environ.get("NVIDIA_API_KEY", "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")
API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
MODEL = "minimaxai/minimax-m3"

SOURCES = [
    {"name": "NASA Mars Science", "url": "https://science.nasa.gov/mars/"},
    {"name": "ESA Mars Express", "url": "https://www.esa.int/Science_Exploration/Space_Science/Mars_Express"},
    {"name": "The Mars Society", "url": "https://www.marssociety.org/"},
    {"name": "IGG CAS Mars Research", "url": "http://www.igg.cas.cn/Mars/"},
]


def call_llm(messages, temperature=0.7, max_tokens=4096, retries=3):
    """Call MiniMax M3 API (via NVIDIA) with retry logic."""
    payload = {
        "model": MODEL,
        "messages": messages,
        "temperature": temperature,
        "top_p": 0.95,
        "max_tokens": max_tokens,
        "stream": False,
    }
    data = json.dumps(payload).encode("utf-8")
    last_err = None
    for attempt in range(retries):
        req = urllib.request.Request(
            API_URL,
            data=data,
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                content = result["choices"][0]["message"]["content"]
                if content and content.strip():
                    return content
                print(f"Empty content on attempt {attempt+1}, retrying...", file=sys.stderr)
                last_err = "Empty content"
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8") if e.fp else ""
            print(f"HTTP Error {e.code}: {body}", file=sys.stderr)
            last_err = str(e)
        except Exception as e:
            print(f"Error on attempt {attempt+1}: {e}", file=sys.stderr)
            last_err = str(e)
        time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"LLM API failed after {retries} retries: {last_err}")


def parse_json_response(text):
    """Robustly extract and parse JSON from a model response that may contain markdown fences or extra text."""
    text = text.strip()
    # Remove markdown code fences
    if "```" in text:
        # Find content between fences
        parts = text.split("```")
        for part in parts:
            part = part.strip()
            # Remove language identifier like "json"
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("{") or part.startswith("["):
                text = part
                break
    # If still has fences, try regex extraction
    import re
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1)
    # Find first JSON object
    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        text = text[start:end]
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        print(f"Failed to parse JSON: {e}", file=sys.stderr)
        print(f"Text was: {text[:500]}", file=sys.stderr)
        raise


def normalize_question_data(q_data):
    """Normalize question data to ensure consistent types."""
    if isinstance(q_data.get("key_data_needed"), list):
        q_data["key_data_needed"] = "; ".join(q_data["key_data_needed"])
    # Ensure all required fields are strings
    for field in ["title", "category", "rationale", "hypothesis", "key_data_needed", "implications"]:
        if field not in q_data or q_data[field] is None:
            q_data[field] = ""
        elif not isinstance(q_data[field], str):
            q_data[field] = str(q_data[field])
    return q_data


def generate_question(existing_questions):
    """Generate a novel scientific question about Mars that humans haven't asked before."""
    existing_list = "\n".join(
        f"- {q['title']}" for q in existing_questions
    ) if existing_questions else "(none yet)"

    prompt = f"""You are a visionary Mars science researcher tasked with proposing NOVEL scientific questions about Mars that have NOT yet been prominently asked or investigated by the human scientific community.

Consider the latest data from these authoritative sources:
- NASA Mars Science (https://science.nasa.gov/mars/)
- ESA Mars Express (https://www.esa.int/Science_Exploration/Space_Science/Mars_Express)
- The Mars Society (https://www.marssociety.org/)
- IGG CAS Mars Research (http://www.igg.cas.cn/Mars/)

Existing questions already asked (avoid these):
{existing_list}

Propose ONE truly novel, scientifically rigorous question about Mars. It should:
1. Be genuinely original and not yet prominently studied
2. Be scientifically answerable with current or near-future data/missions
3. Bridge multiple disciplines (geology, atmospherics, astrobiology, geophysics, etc.)
4. Have significant implications for understanding Mars or planetary science

Return your response as a JSON object with this exact structure:
{{
  "title": "A concise question (end with ?)",
  "category": "One of: Geology, Atmospherics, Astrobiology, Geophysics, Hydrology, Climate, Chemistry, Search-for-Life",
  "rationale": "2-3 sentences explaining why this question is novel and important",
  "hypothesis": "A testable scientific hypothesis",
  "key_data_needed": "What data/observations would be needed",
  "implications": "Why answering this matters for Mars and planetary science"
}}

Return ONLY the JSON object, no other text."""

    response = call_llm(
        [{"role": "user", "content": prompt}],
        temperature=0.9,
        max_tokens=1024,
    )
    return normalize_question_data(parse_json_response(response))


VERIFIED_FACTS_CONSTRAINTS = """
CRITICAL VERIFIED FACTS — You MUST only use these verified facts. Do NOT fabricate any citation, value, or instrument capability.

## INSTRUMENT CAPABILITIES (verified):
- Viking Landers 1 & 2: meteorological sensors (temperature, wind, pressure), cameras. NO electric field measurement capability.
- InSight lander: SEIS (seismometer), HP3 (heat probe), RISE (radio science), IFG (magnetometer - measures MAGNETIC field, NOT electric field), TWINS (temp/wind), PS (pressure). NO electric field sensor. InSight is NOT "Mars Science Laboratory" (MSL is Curiosity).
- MRO CRISM: visible/near-infrared spectrometer for HYDRATED MINERALS. Does NOT detect perchlorates directly.
- MRO HiRISE: high-resolution camera. Dust devil counts are in the thousands, NOT hundreds of thousands.
- Mars Express HRSC: stereo camera for 3D imaging. CANNOT measure electric fields.
- Mars Express MARSIS: subsurface radar. The 2018 subglacial lake discovery was at the SOUTH POLE (Planum Australe / Ultimi Scopuli region), NOT Utopia Planitia. Published by Orosei et al. 2018 in Science.
- Mars Express OMEGA: mineral mapping spectrometer.
- MAVEN: studies Mars UPPER ATMOSPHERE and ionosphere (>150 km altitude), atmospheric escape. Does NOT measure surface dust devil temperatures.
- Phoenix lander WCL (Wet Chemistry Lab): FIRST confirmed detection of perchlorates on Mars (2008/2009, Hecht et al. 2009, Science), at Vastitas Borealis, ~0.4-0.6 wt%.
- Curiosity SAM: detects organics via pyrolysis-GC-MS. Perchlorates detected indirectly via O2 release and chlorinated compounds.
- Perseverance SHERLOC: detects organics via fluorescence/Raman. SHERLOC results published in Sharma et al. 2023 (Nature). PAH detection in sulfates reported at LPSC 2026.

## VERIFIED ORGANIC DETECTIONS:
- Chlorobenzene: detected by Curiosity SAM at CUMBERLAND drill hole, Sheepbed Mudstone. Published by Freissinet et al. 2015 (JGR-Planets). Concentration: approximately 150-300 ppbw. Eigenbrode et al. 2018 (Science) reported thiophenes, aromatics, aliphatics in Murray Formation — NOT chlorobenzene.
- Perseverance Wildcat Ridge (2022): NASA reported significant organics but did NOT report specific ppb PAH concentration.

## CITATION RULES (CRITICAL):
- ONLY cite publications you are confident are REAL. Verified: Hecht et al. 2009 (Science); Eigenbrode et al. 2018 (Science); Freissinet et al. 2015 (JGR); Steele et al. 2018 (Science Advances); Orosei et al. 2018 (Science); Atreya et al. 2006 (Astrobiology); Navarro-Gonzalez et al. 2010.
- Do NOT invent citations with author names + years. Do NOT attribute studies to IGG CAS unless certain.
- When stating quantitative values, qualify with "approximately" or "reported as". If exact value uncertain, give a range.
- No electric field has EVER been directly measured on Mars surface.
"""


def generate_report(question):
    """Generate a rigorous, factually-accurate scientific research report answering the question."""
    prompt = f"""You are a LEADING Mars planetary scientist writing a research report for a top-tier journal (e.g., Nature Geoscience). Scientific RIGOR and FACTUAL ACCURACY are paramount. Every claim must be verifiable. You must NOT fabricate citations, data, or instrument capabilities.

QUESTION UNDER INVESTIGATION:
Title: {question['title']}
Category: {question['category']}
Rationale: {question.get('rationale', '')}
Hypothesis: {question.get('hypothesis', '')}

{VERIFIED_FACTS_CONSTRAINTS}

AUTHORITATIVE DATA SOURCES to reference (use their general findings, do not fabricate specific paper titles unless verified):
- NASA Mars Science (https://science.nasa.gov/mars/): Curiosity, Perseverance, Spirit, Opportunity, InSight, MAVEN, MRO, Odyssey, Viking missions.
- ESA Mars Express (https://www.esa.int/Science_Exploration/Space_Science/Mars_Express): HRSC, MARSIS, OMEGA instruments.
- The Mars Society (https://www.marssociety.org/): analog research, Marspedia, human exploration advocacy.
- IGG CAS (http://www.igg.cas.cn/Mars/): Mars geology, mineralogy, water activity, magnetism research. Reference their general research areas without fabricating specific paper citations.

Write a COMPREHENSIVE, scientifically rigorous research report. Structure:

## Abstract
4-5 sentences summarizing the investigation and findings. Be precise about confidence levels.

## 1. Introduction
Background, why this question matters, current state of knowledge. Reference VERIFIED findings only.

## 2. Methodology
Analytical approach, data sources, reasoning framework. Be explicit about limitations.

## 3. Evidence and Analysis
Detailed analysis with subsections. For EACH piece of evidence:
- State the SOURCE (mission/instrument or publication)
- Give VERIFIED quantitative data (with "approximately" if uncertain)
- Acknowledge uncertainties explicitly
- Do NOT state values you cannot verify. Use qualitative language when exact numbers are uncertain.

## 4. Synthesis
Integrate evidence into a coherent answer. Distinguish what is well-established from what is speculative.

## 5. Implications
What this means for Mars science, comparative planetology, future exploration. Be measured.

## 6. Open Questions
Genuinely novel follow-up questions that emerge.

## 7. References
List ONLY verified sources. Include the 4 authoritative URLs. Do NOT list fabricated citations.

CRITICAL RULES:
1. NEVER fabricate a citation. If unsure a paper exists, write "studies of [topic]" instead.
2. NEVER attribute an instrument capability it does not have.
3. NEVER state a specific concentration/value unless verified. Use qualitative descriptions otherwise.
4. Be HONEST about what is known vs. unknown vs. speculative.
5. Frame novel hypotheses as hypotheses requiring investigation, not as established fact.
6. Length: 2000-3000 words. Depth over false precision.

Write the report now in Markdown."""

    return call_llm(
        [{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=8192,
    )


# ---------------------------------------------------------------------------
# Autonomous Multi-Dimensional Review System
# ---------------------------------------------------------------------------

REVIEW_PASS_THRESHOLD = 80  # Minimum score per dimension to pass without revision


def review_report(question, report_text):
    """Review a research report across four dimensions: scientific validity,
    rationality, standardization, and logicality. Returns a structured review dict."""
    prompt = f"""You are a STRICT, INDEPENDENT scientific peer reviewer for a top-tier planetary science journal (e.g., Nature Geoscience). Your task is to critically evaluate the following Mars research report across FOUR dimensions. Be rigorous and unforgiving of errors.

QUESTION UNDER INVESTIGATION:
Title: {question['title']}
Category: {question['category']}
Hypothesis: {question.get('hypothesis', '')}

{VERIFIED_FACTS_CONSTRAINTS}

REPORT TO REVIEW:
---
{report_text}
---

Evaluate the report across these FOUR dimensions, scoring each 0-100:

1. SCIENTIFIC VALIDITY (科学性): Are all scientific claims factually accurate? Are citations real and correctly attributed? Are instrument capabilities described correctly? Are quantitative values verified and correctly stated? Are there any fabricated citations, incorrect data, or misattributed instrument capabilities? Cross-check against the VERIFIED FACTS above.

2. RATIONALITY (合理性): Is the reasoning sound? Are conclusions justified by the evidence presented? Are hypotheses framed appropriately (as hypotheses, not established fact)? Are uncertainties acknowledged? Are alternative explanations considered? Is the analysis balanced?

3. STANDARDIZATION (规范性): Does the report follow proper scientific writing standards? Is the structure complete (Abstract, Introduction, Methodology, Evidence, Synthesis, Implications, Open Questions, References)? Are citations formatted consistently? Is the language precise and professional? Are sections properly labeled?

4. LOGICALITY (逻辑性): Is the argumentation logically coherent? Do sections flow logically from one to the next? Are there any contradictions within the report? Does the synthesis actually synthesize the evidence presented? Are conclusions consistent with the analysis? Are there any logical fallacies?

Return your review as a JSON object with this EXACT structure:
{{
  "overall_score": <integer 0-100>,
  "dimensions": {{
    "scientific_validity": {{
      "score": <integer 0-100>,
      "assessment": "<2-3 sentence summary of this dimension>",
      "issues": ["<specific issue 1>", "<specific issue 2>", ...]
    }},
    "rationality": {{
      "score": <integer 0-100>,
      "assessment": "<2-3 sentence summary>",
      "issues": ["<specific issue 1>", ...]
    }},
    "standardization": {{
      "score": <integer 0-100>,
      "assessment": "<2-3 sentence summary>",
      "issues": ["<specific issue 1>", ...]
    }},
    "logicality": {{
      "score": <integer 0-100>,
      "assessment": "<2-3 sentence summary>",
      "issues": ["<specific issue 1>", ...]
    }}
  }},
  "revision_needed": <true if ANY dimension scores below {REVIEW_PASS_THRESHOLD} OR if any critical factual error is found>,
  "revision_instructions": "<If revision_needed is true, provide SPECIFIC, ACTIONABLE instructions for fixing each identified issue. If false, write 'No revision needed - report meets scientific standards.'>"
}}

Be thorough and specific. List EVERY issue you find, no matter how minor. Return ONLY the JSON object."""

    response = call_llm(
        [{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=4096,
    )
    review = parse_json_response(response)

    # Ensure structure completeness
    review.setdefault("overall_score", 0)
    review.setdefault("dimensions", {})
    for dim in ["scientific_validity", "rationality", "standardization", "logicality"]:
        review["dimensions"].setdefault(dim, {"score": 0, "assessment": "", "issues": []})
        review["dimensions"][dim].setdefault("score", 0)
        review["dimensions"][dim].setdefault("assessment", "")
        review["dimensions"][dim].setdefault("issues", [])
    review.setdefault("revision_needed", False)
    review.setdefault("revision_instructions", "")

    return review


def revise_report(question, report_text, review):
    """Revise a report based on review feedback to fix all identified issues."""
    issues_summary = json.dumps(review.get("dimensions", {}), indent=2, ensure_ascii=False)
    revision_instructions = review.get("revision_instructions", "Fix all identified issues.")

    prompt = f"""You are a LEADING Mars planetary scientist revising a research report to fix ALL issues identified by a rigorous peer reviewer. Your revision must address every single issue while maintaining the report's strengths.

QUESTION UNDER INVESTIGATION:
Title: {question['title']}
Category: {question['category']}
Hypothesis: {question.get('hypothesis', '')}

{VERIFIED_FACTS_CONSTRAINTS}

ORIGINAL REPORT:
---
{report_text}
---

REVIEWER'S DETAILED FINDINGS (issues to fix):
{issues_summary}

REVIEWER'S REVISION INSTRUCTIONS:
{revision_instructions}

CRITICAL REVISION RULES:
1. Fix EVERY issue listed by the reviewer. Do not skip any.
2. If a factual error was found, correct it using ONLY verified facts from the constraints above.
3. If a citation was fabricated or incorrect, remove it or replace with a verified one.
4. If an instrument capability was misstated, correct it to match verified capabilities.
5. If a logical inconsistency was found, restructure the argument to eliminate it.
6. If a structural issue was found, fix the formatting/structure.
7. Maintain the same overall structure: Abstract, Introduction, Methodology, Evidence and Analysis, Synthesis, Implications, Open Questions, References.
8. Do NOT introduce new factual claims that are not in the verified facts.
9. Do NOT fabricate any new citations.
10. Keep the report comprehensive (2000-3000 words).
11. Output ONLY the revised report in Markdown. Do not include any meta-commentary about what you changed.

Write the COMPLETE revised report now in Markdown."""

    return call_llm(
        [{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=8192,
    )


def generate_report_with_review(question, reports_dir, reviews_dir, now):
    """Full pipeline: generate report -> review -> revise if needed -> re-review.
    Returns (final_report_text, review_history_list)."""
    # Step 1: Generate initial report
    print(f"  [1/4] Generating initial report...", flush=True)
    report = generate_report(question)

    # Step 2: Review the report
    print(f"  [2/4] Conducting multi-dimensional review...", flush=True)
    review = review_report(question, report)
    review["iteration"] = 0
    review["timestamp"] = now.isoformat()
    review_history = [review]

    dim_scores = {d: review["dimensions"][d]["score"] for d in review["dimensions"]}
    print(f"  Review scores: {dim_scores}", flush=True)
    print(f"  Overall: {review['overall_score']}/100, Revision needed: {review['revision_needed']}", flush=True)

    # Step 3: If revision needed, revise and re-review (up to 2 iterations)
    max_iterations = 2
    iteration = 0
    while review.get("revision_needed", False) and iteration < max_iterations:
        iteration += 1
        print(f"  [3/4] Revision iteration {iteration}/{max_iterations}...", flush=True)
        report = revise_report(question, report, review)

        print(f"  Re-reviewing revised report...", flush=True)
        review = review_report(question, report)
        review["iteration"] = iteration
        review["timestamp"] = now.isoformat()
        review_history.append(review)

        dim_scores = {d: review["dimensions"][d]["score"] for d in review["dimensions"]}
        print(f"  Revised scores: {dim_scores}", flush=True)
        print(f"  Overall: {review['overall_score']}/100, Revision needed: {review['revision_needed']}", flush=True)

    if review.get("revision_needed", False):
        print(f"  [4/4] Max revisions reached. Report finalized with remaining issues noted.", flush=True)
    else:
        print(f"  [4/4] Report passed review. Finalized.", flush=True)

    # Save review metadata
    review_filename = f"{question['id']}_review.json"
    review_path = os.path.join(reviews_dir, review_filename)
    review_data = {
        "question_id": question["id"],
        "question_title": question["title"],
        "review_date": now.strftime("%Y-%m-%d"),
        "total_iterations": len(review_history) - 1,
        "final_overall_score": review_history[-1]["overall_score"],
        "final_dimension_scores": {
            d: review_history[-1]["dimensions"][d]["score"] for d in review_history[-1]["dimensions"]
        },
        "final_revision_needed": review_history[-1]["revision_needed"],
        "review_history": review_history,
    }
    with open(review_path, "w") as f:
        json.dump(review_data, f, indent=2, ensure_ascii=False)
    print(f"  Review metadata saved to {review_path}", flush=True)

    return report, review_data


def main():
    data_dir = sys.argv[1] if len(sys.argv) > 1 else "data"
    mode = sys.argv[2] if len(sys.argv) > 2 else "seed"

    questions_file = os.path.join(data_dir, "questions.json")
    reports_dir = os.path.join(data_dir, "reports")
    reviews_dir = os.path.join(data_dir, "reviews")
    os.makedirs(reports_dir, exist_ok=True)
    os.makedirs(reviews_dir, exist_ok=True)

    # Load existing questions
    existing = []
    if os.path.exists(questions_file):
        with open(questions_file, "r") as f:
            existing = json.load(f)

    now = datetime.now(timezone.utc)

    if mode == "question":
        # Generate a new question only
        print("Generating novel Mars scientific question...", flush=True)
        q_data = generate_question(existing)
        question_id = f"Q{len(existing) + 1:03d}"
        question = {
            "id": question_id,
            **q_data,
            "asked_date": now.strftime("%Y-%m-%d"),
            "asked_timestamp": now.isoformat(),
            "status": "researching",
            "report_ready_date": (now + timedelta(days=7)).strftime("%Y-%m-%d"),
            "report_file": None,
        }
        existing.append(question)
        with open(questions_file, "w") as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)
        print(f"Generated question {question_id}: {question['title']}", flush=True)
        print(json.dumps(question, indent=2), flush=True)

    elif mode == "report":
        # Generate report for the oldest question without a report
        target = None
        for q in existing:
            if q.get("report_file") is None and q.get("status") == "researching":
                target = q
                break
        if not target:
            print("No questions pending report generation.", flush=True)
            return
        print(f"Generating report for {target['id']}: {target['title']}", flush=True)
        report, review_data = generate_report_with_review(target, reports_dir, reviews_dir, now)
        report_filename = f"{target['id']}_report.md"
        report_path = os.path.join(reports_dir, report_filename)
        with open(report_path, "w") as f:
            f.write(f"# {target['title']}\n\n")
            f.write(f"**Category:** {target['category']}  \n")
            f.write(f"**Asked:** {target['asked_date']}  \n")
            f.write(f"**Report Generated:** {now.strftime('%Y-%m-%d')} (v2 — Reviewed & Revised)\n\n")
            f.write(f"**Hypothesis:** {target['hypothesis']}\n\n")
            f.write("---\n\n")
            f.write(report)
        target["report_file"] = f"reports/{report_filename}"
        target["status"] = "completed"
        target["report_generated"] = now.isoformat()
        target["review_score"] = review_data["final_overall_score"]
        target["review_dimensions"] = review_data["final_dimension_scores"]
        target["review_iterations"] = review_data["total_iterations"]
        with open(questions_file, "w") as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)
        print(f"Report saved to {report_path}", flush=True)

    elif mode == "seed":
        # Seed: generate 3 questions + reports
        num_to_seed = int(sys.argv[3]) if len(sys.argv) > 3 else 3
        print(f"Seeding {num_to_seed} questions and reports...", flush=True)
        for i in range(num_to_seed):
            print(f"\n--- Question {i+1}/{num_to_seed} ---", flush=True)
            q_data = generate_question(existing)
            question_id = f"Q{len(existing) + 1:03d}"
            asked_date = now - timedelta(days=(num_to_seed - i) * 9)
            question = {
                "id": question_id,
                **q_data,
                "asked_date": asked_date.strftime("%Y-%m-%d"),
                "asked_timestamp": asked_date.isoformat(),
                "status": "researching",
                "report_ready_date": (asked_date + timedelta(days=7)).strftime("%Y-%m-%d"),
                "report_file": None,
            }
            existing.append(question)
            # Save intermediate
            with open(questions_file, "w") as f:
                json.dump(existing, f, indent=2, ensure_ascii=False)
            print(f"Generated: {question['title']}", flush=True)
            # Generate report with review
            print(f"Generating report with autonomous review...", flush=True)
            report, review_data = generate_report_with_review(question, reports_dir, reviews_dir, asked_date + timedelta(days=7))
            report_filename = f"{question_id}_report.md"
            report_path = os.path.join(reports_dir, report_filename)
            with open(report_path, "w") as f:
                f.write(f"# {question['title']}\n\n")
                f.write(f"**Category:** {question['category']}  \n")
                f.write(f"**Asked:** {question['asked_date']}  \n")
                f.write(f"**Report Generated:** {(asked_date + timedelta(days=7)).strftime('%Y-%m-%d')} (v2 — Reviewed & Revised)\n\n")
                f.write(f"**Hypothesis:** {question['hypothesis']}\n\n")
                f.write("---\n\n")
                f.write(report)
            question["report_file"] = f"reports/{report_filename}"
            question["status"] = "completed"
            question["report_generated"] = (asked_date + timedelta(days=7)).isoformat()
            question["review_score"] = review_data["final_overall_score"]
            question["review_dimensions"] = review_data["final_dimension_scores"]
            question["review_iterations"] = review_data["total_iterations"]
            with open(questions_file, "w") as f:
                json.dump(existing, f, indent=2, ensure_ascii=False)
            print(f"Report saved.", flush=True)
            time.sleep(2)  # Rate limit courtesy

        print(f"\nSeeded {num_to_seed} questions with reports.", flush=True)

    elif mode == "in-progress":
        # Generate one question that is "in progress" (no report yet)
        print("Generating in-progress question...", flush=True)
        q_data = generate_question(existing)
        question_id = f"Q{len(existing) + 1:03d}"
        question = {
            "id": question_id,
            **q_data,
            "asked_date": (now - timedelta(days=2)).strftime("%Y-%m-%d"),
            "asked_timestamp": (now - timedelta(days=2)).isoformat(),
            "status": "researching",
            "report_ready_date": (now + timedelta(days=5)).strftime("%Y-%m-%d"),
            "report_file": None,
        }
        existing.append(question)
        with open(questions_file, "w") as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)
        print(f"Generated in-progress question {question_id}: {question['title']}", flush=True)

    elif mode == "daily":
        # Daily run: generate a new question if 2+ days since last question,
        # and generate reports for questions that are 7+ days old without reports.
        print("=== Daily AI Research Run ===", flush=True)

        # Step 1: Generate reports for ready questions
        reports_generated = 0
        for q in existing:
            if q.get("report_file") is None and q.get("status") == "researching":
                asked = datetime.fromisoformat(q["asked_timestamp"].replace("Z", "+00:00"))
                age_days = (now - asked).days
                if age_days >= 7:
                    print(f"\nGenerating report for {q['id']} (age: {age_days}d): {q['title']}", flush=True)
                    try:
                        report, review_data = generate_report_with_review(q, reports_dir, reviews_dir, now)
                        report_filename = f"{q['id']}_report.md"
                        report_path = os.path.join(reports_dir, report_filename)
                        with open(report_path, "w") as f:
                            f.write(f"# {q['title']}\n\n")
                            f.write(f"**Category:** {q['category']}  \n")
                            f.write(f"**Asked:** {q['asked_date']}  \n")
                            f.write(f"**Report Generated:** {now.strftime('%Y-%m-%d')} (v2 — Reviewed & Revised)\n\n")
                            f.write(f"**Hypothesis:** {q.get('hypothesis', '')}\n\n")
                            f.write("---\n\n")
                            f.write(report)
                        q["report_file"] = f"reports/{report_filename}"
                        q["status"] = "completed"
                        q["report_generated"] = now.isoformat()
                        q["review_score"] = review_data["final_overall_score"]
                        q["review_dimensions"] = review_data["final_dimension_scores"]
                        q["review_iterations"] = review_data["total_iterations"]
                        reports_generated += 1
                        print(f"Report saved.", flush=True)
                        time.sleep(2)
                    except Exception as e:
                        print(f"Failed to generate report: {e}", file=sys.stderr)

        if reports_generated > 0:
            with open(questions_file, "w") as f:
                json.dump(existing, f, indent=2, ensure_ascii=False)

        # Step 2: Generate a new question if 2+ days since last question
        should_ask = True
        if existing:
            last_q = existing[-1]
            last_asked = datetime.fromisoformat(last_q["asked_timestamp"].replace("Z", "+00:00"))
            days_since = (now - last_asked).days
            if days_since < 2:
                should_ask = False
                print(f"\nLast question was {days_since}d ago. Next question in {2 - days_since}d.", flush=True)

        if should_ask:
            print("\nGenerating new question...", flush=True)
            try:
                q_data = generate_question(existing)
                question_id = f"Q{len(existing) + 1:03d}"
                question = {
                    "id": question_id,
                    **q_data,
                    "asked_date": now.strftime("%Y-%m-%d"),
                    "asked_timestamp": now.isoformat(),
                    "status": "researching",
                    "report_ready_date": (now + timedelta(days=7)).strftime("%Y-%m-%d"),
                    "report_file": None,
                }
                existing.append(question)
                with open(questions_file, "w") as f:
                    json.dump(existing, f, indent=2, ensure_ascii=False)
                print(f"New question: {question_id}: {question['title']}", flush=True)
            except Exception as e:
                print(f"Failed to generate question: {e}", file=sys.stderr)

        print(f"\n=== Daily run complete: {reports_generated} reports, {'1' if should_ask else '0'} new question ===", flush=True)

    elif mode == "review-existing":
        # Review and revise existing reports that haven't been through the review pipeline
        print("=== Reviewing Existing Reports ===", flush=True)
        reviewed_count = 0
        for q in existing:
            if q.get("status") != "completed" or not q.get("report_file"):
                continue
            # Skip if already has review data
            review_filename = f"{q['id']}_review.json"
            review_path = os.path.join(reviews_dir, review_filename)
            if os.path.exists(review_path):
                print(f"\n{q['id']} already reviewed. Skipping.", flush=True)
                continue

            # Read existing report
            report_path = os.path.join(data_dir, q["report_file"])
            if not os.path.exists(report_path):
                print(f"\n{q['id']} report file not found. Skipping.", flush=True)
                continue

            print(f"\nReviewing {q['id']}: {q['title']}", flush=True)
            with open(report_path, "r") as f:
                full_report = f.read()

            # Extract just the report body (after the header and --- separator)
            parts = full_report.split("---\n\n", 1)
            report_body = parts[1] if len(parts) > 1 else full_report

            try:
                # Review the EXISTING report (not generate a new one)
                print(f"  [1/3] Conducting multi-dimensional review...", flush=True)
                review = review_report(q, report_body)
                review["iteration"] = 0
                review["timestamp"] = now.isoformat()
                review_history = [review]

                dim_scores = {d: review["dimensions"][d]["score"] for d in review["dimensions"]}
                print(f"  Review scores: {dim_scores}", flush=True)
                print(f"  Overall: {review['overall_score']}/100, Revision needed: {review['revision_needed']}", flush=True)

                # Helper: save review metadata + revised report
                def save_review_state(rev_history, rev_report, was_revised):
                    review_filename = f"{q['id']}_review.json"
                    review_path = os.path.join(reviews_dir, review_filename)
                    rdata = {
                        "question_id": q["id"],
                        "question_title": q["title"],
                        "review_date": now.strftime("%Y-%m-%d"),
                        "total_iterations": len(rev_history) - 1,
                        "final_overall_score": rev_history[-1]["overall_score"],
                        "final_dimension_scores": {
                            d: rev_history[-1]["dimensions"][d]["score"] for d in rev_history[-1]["dimensions"]
                        },
                        "final_revision_needed": rev_history[-1]["revision_needed"],
                        "review_history": rev_history,
                    }
                    with open(review_path, "w") as f:
                        json.dump(rdata, f, indent=2, ensure_ascii=False)
                    if was_revised:
                        with open(report_path, "w") as f:
                            f.write(f"# {q['title']}\n\n")
                            f.write(f"**Category:** {q['category']}  \n")
                            f.write(f"**Asked:** {q['asked_date']}  \n")
                            f.write(f"**Report Generated:** {now.strftime('%Y-%m-%d')} (v3 — Reviewed & Revised)\n\n")
                            f.write(f"**Hypothesis:** {q.get('hypothesis', '')}\n\n")
                            f.write("---\n\n")
                            f.write(rev_report)
                    return rdata

                # Save initial review (even if no revision needed yet)
                review_data = save_review_state(review_history, report_body, False)

                # Revise if needed (up to 2 iterations)
                current_report = report_body
                max_iterations = 2
                iteration = 0
                while review.get("revision_needed", False) and iteration < max_iterations:
                    iteration += 1
                    print(f"  [2/3] Revision iteration {iteration}/{max_iterations}...", flush=True)
                    try:
                        current_report = revise_report(q, current_report, review)

                        print(f"  Re-reviewing revised report...", flush=True)
                        review = review_report(q, current_report)
                        review["iteration"] = iteration
                        review["timestamp"] = now.isoformat()
                        review_history.append(review)

                        dim_scores = {d: review["dimensions"][d]["score"] for d in review["dimensions"]}
                        print(f"  Revised scores: {dim_scores}", flush=True)
                        print(f"  Overall: {review['overall_score']}/100, Revision needed: {review['revision_needed']}", flush=True)

                        # Save intermediate results after each successful revision
                        review_data = save_review_state(review_history, current_report, True)
                        print(f"  Intermediate results saved.", flush=True)
                    except Exception as rev_e:
                        print(f"  Revision {iteration} failed: {rev_e}. Keeping previous version.", file=sys.stderr)
                        break

                if review.get("revision_needed", False):
                    print(f"  [3/3] Max revisions reached. Report finalized with remaining issues noted.", flush=True)
                else:
                    print(f"  [3/3] Report passed review. Finalized.", flush=True)

                print(f"  Review metadata saved.", flush=True)

                q["review_score"] = review_data["final_overall_score"]
                q["review_dimensions"] = review_data["final_dimension_scores"]
                q["review_iterations"] = review_data["total_iterations"]
                reviewed_count += 1
                print(f"  {q['id']} review complete. Score: {review_data['final_overall_score']}/100", flush=True)
                time.sleep(2)
            except Exception as e:
                print(f"  Failed to review {q['id']}: {e}", file=sys.stderr)

        if reviewed_count > 0:
            with open(questions_file, "w") as f:
                json.dump(existing, f, indent=2, ensure_ascii=False)

        print(f"\n=== Review complete: {reviewed_count} reports reviewed ===", flush=True)


if __name__ == "__main__":
    main()
