import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

EXPECTED_FIELDS = {
    "sprint",
    "distance",
    "dribbling",
    "passing",
    "shooting",
    "defending",
    "interceptions",
    "possession",
    "goalkeeping",
    "communication",
}


def json_response(handler, status, data):
    body = json.dumps(data).encode("utf-8")

    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class handler(BaseHTTPRequestHandler):

    def do_POST(self):
        if self.path != "/api/coach":
            json_response(self, 404, {"error": "Endpoint not found."})
            return

        try:
            content_length = int(
                self.headers.get("Content-Length", "0")
            )

            if content_length <= 0 or content_length > 10000:
                json_response(
                    self,
                    400,
                    {"error": "Invalid request size."}
                )
                return

            raw_body = self.rfile.read(content_length)
            stats = json.loads(raw_body)

            if not isinstance(stats, dict):
                json_response(
                    self,
                    400,
                    {"error": "Invalid stats format."}
                )
                return

            if set(stats.keys()) != EXPECTED_FIELDS:
                json_response(
                    self,
                    400,
                    {"error": "Please submit all 10 soccer measurements."}
                )
                return

            # Validate every measurement on the server.
            for field in EXPECTED_FIELDS:
                value = stats[field]

                if isinstance(value, bool) or not isinstance(
                    value, (int, float)
                ):
                    json_response(
                        self,
                        400,
                        {"error": f"Invalid value for {field}."}
                    )
                    return

                if not (0 <= value <= 100000):
                    json_response(
                        self,
                        400,
                        {"error": f"Out-of-range value for {field}."}
                    )
                    return

            # Validate values that must be positive.
            if (
                stats["sprint"] <= 0
                or stats["dribbling"] <= 0
                or stats["distance"] <= 0
            ):
                json_response(
                    self,
                    400,
                    {
                        "error": (
                            "Sprint time, dribbling time, and "
                            "running distance must be positive."
                        )
                    }
                )
                return

            # These measurements are recorded out of 10.
            for field in (
                "passing",
                "shooting",
                "defending",
                "possession",
                "goalkeeping",
            ):
                if (
                    not float(stats[field]).is_integer()
                    or not 0 <= stats[field] <= 10
                ):
                    json_response(
                        self,
                        400,
                        {
                            "error": (
                                f"{field.capitalize()} must be "
                                "a whole number from 0 to 10."
                            )
                        }
                    )
                    return

            if (
                not float(stats["interceptions"]).is_integer()
                or not float(stats["communication"]).is_integer()
            ):
                json_response(
                    self,
                    400,
                    {
                        "error": (
                            "Interceptions and communication "
                            "must be whole numbers."
                        )
                    }
                )
                return

            prompt = f"""
Analyze the following soccer player's performance data.

PLAYER MEASUREMENTS:
- 30-meter sprint: {stats["sprint"]} seconds
- Distance covered in 6 minutes: {stats["distance"]}
  (unit not specified)
- Dribbling through 6 cones spaced 2 meters apart:
  {stats["dribbling"]} seconds
- Accurate passes out of 10: {stats["passing"]}
- Shots on target out of 10: {stats["shooting"]}
- Successful defensive stops out of 10: {stats["defending"]}
- Interceptions in a 10-minute game: {stats["interceptions"]}
- Successful 5-second possession attempts out of 10:
  {stats["possession"]}
- Saves out of 10 controlled shots: {stats["goalkeeping"]}
- Useful teammate instructions in 10 minutes:
  {stats["communication"]}

YOUR ROLE:
Act as an experienced professional soccer coach who provides
constructive, evidence-informed player development feedback.

Write a comprehensive, personalized report using these sections:

1. OVERALL PLAYER ASSESSMENT
Summarize the player's current results. Do not invent an overall
score, professional status, or competitive ranking.

2. STRENGTHS
Identify the strongest measured areas and explain why they matter
in soccer. Distinguish measured results from tentative conclusions.

3. AREAS FOR IMPROVEMENT
Identify the measurements that may benefit from training.
Explain what each measurement does and does not tell us.

4. POSITIONAL SUITABILITY
Discuss which roles might be worth exploring, based on the data.
Consider outfield roles and goalkeeping where relevant. Do not
claim that these measurements alone establish the player's ideal
position or professional potential.

5. PERSONALIZED TRAINING PLAN
Create a practical 4-week development plan. Include drills,
suggested frequency, repetitions or duration, recovery, and
progression. Adapt the plan to the results rather than giving
generic advice. Keep the workload age-appropriate and emphasize
proper technique, rest, and injury prevention. Also prioritize health and nutrition,
specifically diet. Give a disclaimer that you are not a medical professional and to
double-check important medical information. Advise to consult a medical professional
if wanting to take a drastic change in diet.

6. TECHNICAL AND TACTICAL DEVELOPMENT
Give specific recommendations for passing, shooting, dribbling,
defending, positioning, decision-making, and communication,
prioritizing the most relevant areas.

7. HOW TO TRACK PROGRESS
Explain how to repeat these tests consistently and which
improvements to look for. Do not invent baseline measurements.

8. COACH'S FINAL RECOMMENDATIONS
Give the player three clear priorities for their next training
sessions and realistic encouragement.

9. INSPIRATION
To ensure the player can remain consistent and motivated, remind them
of the person they can become. Also, make it seem like one small step
rather than a bunch of obligations to take on. Use motivational quotes
and soccer icons to demonstrate the importance of consistency and hard work.

IMPORTANT RULES:
- Be constructive, specific, and professional.
- Never shame or insult the player. Give them advice and encourage them with wise sayings.
- Do not diagnose fitness or medical conditions. Emphasize that you are not a medical professional.
- Do not promise professional contracts or predict a career. Assure them that they are going to reach their full potential.
- Results alone do not establish a player's age-group ranking.
- The running-distance unit is unknown. Do not assume miles or
  kilometers. Explain that the player should record the unit
  and use it consistently.
- Interpret all results in the context of test conditions,
  age, experience, and playing level, which are not provided.
- For communication and interceptions, higher counts are not
  automatically better without considering quality, team tactics,
  and playing time.
- Avoid false precision and unsupported comparisons.
- Use clear headings and practical explanations.
- If an important detail is missing, explain the limitation
  rather than inventing information.
"""

            response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a knowledgeable professional "
                            "soccer coach specializing in player "
                            "development. Provide balanced, specific, "
                            "age-appropriate coaching advice."
                        ),
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
                temperature=0.7,
                max_tokens=3000,
            )

            analysis = response.choices[0].message.content

            if not analysis:
                raise ValueError("The AI returned an empty report.")

            json_response(
                self,
                200,
                {"analysis": analysis}
            )

        except json.JSONDecodeError:
            json_response(
                self,
                400,
                {"error": "The submitted data was not valid JSON."}
            )

        except Exception:
            # Keep API keys and internal error details private.
            print("AI coach request failed.")
            json_response(
                self,
                500,
                {
                    "error": (
                        "The AI coach could not generate your report. "
                        "Please try again later."
                    )
                }
            )

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()