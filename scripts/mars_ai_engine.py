#!/usr/bin/env python3
"""
Mars AI Research Engine
Generates novel scientific questions about Mars and research reports using GLM-4.5-Flash.
This script is used both for initial seeding and by GitHub Actions for ongoing generation.
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

API_KEY = os.environ.get("GLM_API_KEY", "325d6fa364954d2e871c30ba95b553bd.KBdQdqgJgELJBhnv")
API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
MODEL = "glm-4.5-flash"

SOURCES = [
    {"name": "NASA Mars Science", "url": "https://science.nasa.gov/mars/"},
    {"name": "ESA Mars Express", "url": "https://www.esa.int/Science_Exploration/Space_Science/Mars_Express"},
    {"name": "The Mars Society", "url": "https://www.marssociety.org/"},
    {"name": "IGG CAS Mars Research", "url": "http://www.igg.cas.cn/Mars/"},
]


def call_glm(messages, temperature=0.7, max_tokens=4096, retries=3):
    """Call GLM-4.5-Flash API with retry logic. Thinking mode disabled for direct output."""
    payload = {
        "model": MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "thinking": {"type": "disabled"},
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
    raise RuntimeError(f"GLM API failed after {retries} retries: {last_err}")


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

    response = call_glm(
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

    return call_glm(
        [{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=8192,
    )


def main():
    data_dir = sys.argv[1] if len(sys.argv) > 1 else "data"
    mode = sys.argv[2] if len(sys.argv) > 2 else "seed"

    questions_file = os.path.join(data_dir, "questions.json")
    reports_dir = os.path.join(data_dir, "reports")
    os.makedirs(reports_dir, exist_ok=True)

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
        report = generate_report(target)
        report_filename = f"{target['id']}_report.md"
        report_path = os.path.join(reports_dir, report_filename)
        with open(report_path, "w") as f:
            f.write(f"# {target['title']}\n\n")
            f.write(f"**Category:** {target['category']}  \n")
            f.write(f"**Asked:** {target['asked_date']}  \n")
            f.write(f"**Report Generated:** {now.strftime('%Y-%m-%d')}  \n\n")
            f.write(f"**Hypothesis:** {target['hypothesis']}\n\n")
            f.write("---\n\n")
            f.write(report)
        target["report_file"] = f"reports/{report_filename}"
        target["status"] = "completed"
        target["report_generated"] = now.isoformat()
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
            # Generate report
            print(f"Generating report...", flush=True)
            report = generate_report(question)
            report_filename = f"{question_id}_report.md"
            report_path = os.path.join(reports_dir, report_filename)
            with open(report_path, "w") as f:
                f.write(f"# {question['title']}\n\n")
                f.write(f"**Category:** {question['category']}  \n")
                f.write(f"**Asked:** {question['asked_date']}  \n")
                f.write(f"**Report Generated:** {(asked_date + timedelta(days=7)).strftime('%Y-%m-%d')}  \n\n")
                f.write(f"**Hypothesis:** {question['hypothesis']}\n\n")
                f.write("---\n\n")
                f.write(report)
            question["report_file"] = f"reports/{report_filename}"
            question["status"] = "completed"
            question["report_generated"] = (asked_date + timedelta(days=7)).isoformat()
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
                        report = generate_report(q)
                        report_filename = f"{q['id']}_report.md"
                        report_path = os.path.join(reports_dir, report_filename)
                        with open(report_path, "w") as f:
                            f.write(f"# {q['title']}\n\n")
                            f.write(f"**Category:** {q['category']}  \n")
                            f.write(f"**Asked:** {q['asked_date']}  \n")
                            f.write(f"**Report Generated:** {now.strftime('%Y-%m-%d')}  \n\n")
                            f.write(f"**Hypothesis:** {q.get('hypothesis', '')}\n\n")
                            f.write("---\n\n")
                            f.write(report)
                        q["report_file"] = f"reports/{report_filename}"
                        q["status"] = "completed"
                        q["report_generated"] = now.isoformat()
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


if __name__ == "__main__":
    main()
