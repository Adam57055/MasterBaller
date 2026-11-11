from openai import OpenAI

client = OpenAI()

#context for user
SYSTEM_PROMPT = """
You are Baller, a personal soccer development assistant.
Explain training plans, answer questions,
and provide personalized suggestions.
"""

#input mechanics
def talk_to_baller(user_message, athlete_profile):

    response = client.responses.create(
        model="YOUR_MODEL",
        instructions=SYSTEM_PROMPT,
        input=f"""
        Athlete information:
        {athlete_profile}

        Athlete question:
        {user_message}
        """
    )

    return response.output_text