import json
import os
from http.server import BaseHTTPRequestHandler

from openai import OpenAI


def send_json(handler, status, data):
    response = json.dumps(data).encode("utf-8")

    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(response)))
    handler.end_headers()
    handler.wfile.write(response)


class handler(BaseHTTPRequestHandler):

    def do_POST(self):
        api_key = os.environ.get("GROQ_API_KEY")

        if not api_key:
            send_json(self, 500, {
                "error": "The AI service is not configured."
            })
            return

        try:
            length = int(self.headers.get("Content-Length", 0))

            if length <= 0 or length > 10000:
                send_json(self, 400, {
                    "error": "Invalid request size."
                })
                return

            data = json.loads(self.rfile.read(length))

            required_fields = [
                "sprint",
                "distance",
                "dribbling",
                "passing",
                "shooting",
                "defending",
                "interceptions",
                "possession",
                "goalkeeping",
                "communication"
            ]

            for field in required_fields:
                if field not in data:
                    send_json(self, 400, {
                        "error": f"Missing field: {field}"
                    })
                    return

                if isinstance(data[field], bool):
                    send_json(self, 400, {
                        "error": f"Invalid value for {field}."
                    })
                    return

                if not isinstance(data[field], (int, float)):
                    send_json(self, 400, {
                        "error": f"Invalid value for {field}."
                    })
                    return

                if not 0 <= data[field] <= 100000:
                    send_json(self, 400, {
                        "error": f"Value out of range for {field}."
                    })
                    return

            for field in [
                "passing",
                "shooting",
                "defending",
                "possession",
                "goalkeeping"
            ]:
                if data[field] > 10:
                    send_json(self, 400, {
                        "error": f"{field} must be between 0 and 10."
                    })
                    return

            if data["sprint"] <= 0 or data["dribbling"] <= 0:
                send_json(self, 400, {
                    "error": "Sprint and dribbling times must be positive."
                })
                return

            if data["distance"] <= 0:
                send_json(self, 400, {
                    "error": "Distance must be positive."
                })
                return

            client = OpenAI(
                api_key=api_key,
                base_url="https://api.groq.com/openai/v1"
            )

            prompt = f"""
You are an experienced soccer coach analyzing a player's
self-reported performance measurements.

PLAYER STATISTICS:
- 30-meter sprint: {data["sprint"]} seconds
- Distance run in 6 minutes: {data["distance"]}
- Dribbling through 6 cones: {data["dribbling"]} seconds
- Passing accuracy: {data["passing"]}/10
- Shooting accuracy: {data["shooting"]}/10
- Successful defensive stops: {data["defending"]}/10
- Interceptions in 10 minutes: {data["interceptions"]}
- Ball retention attempts: {data["possession"]}/10
- Saves: {data["goalkeeping"]}/10
- Useful communications in 10 minutes: {data["communication"]}

Write a detailed, constructive soccer development report with:

1. OVERALL ASSESSMENT
Summarize the player's current results without inventing
professional benchmarks or claiming certainty from limited data.

2. STRENGTHS
Identify the strongest measured areas and explain their
potential value during a match.

3. AREAS TO IMPROVE
Identify weaker results and suggest practical ways to improve.

4. POSITIONAL SUITABILITY
Discuss which positions might suit these results and why.
Explain that these measurements alone cannot determine
the player's ideal position.

5. FOUR-WEEK TRAINING PLAN
Give a realistic weekly plan with technical, tactical,
speed, and fitness activities, including rest and recovery.

6. TECHNICAL DEVELOPMENT
Recommend specific passing, dribbling, shooting, and
ball-control drills where appropriate.

7. TACTICAL DEVELOPMENT
Explain how to improve positioning, decision-making,
defensive awareness, and communication.

8. PROGRESS TRACKING
Explain how to repeat these tests consistently and record
improvement over time.

9. FINAL COACH'S RECOMMENDATIONS
End with three clear priorities for the player.

Use encouraging, specific, easy-to-understand language.
Do not diagnose injuries or recommend unsafe training.
Do not assume the player is a professional athlete.
Point out that these are self-reported measurements and
that testing conditions affect results.

Use clear headings and readable paragraphs.
"""

            result = client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a knowledgeable, constructive "
                            "soccer development coach."
                        )
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.6,
                max_tokens=2500
            )

            analysis = result.choices[0].message.content

            if not analysis:
                send_json(self, 502, {
                    "error": "The AI returned an empty report. Try again."
                })
                return

            send_json(self, 200, {
                "analysis": analysis
            })

        except json.JSONDecodeError:
            send_json(self, 400, {
                "error": "The request contained invalid JSON."
            })

        except Exception as error:
            print("Coach API error:", repr(error))

            send_json(self, 500, {
                "error": (
                    "The coaching report could not be generated. "
                    "Please try again later."
                )
            })
