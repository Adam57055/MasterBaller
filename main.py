from openai import OpenAI()
import gpt-5

response = client.chat.completions.create(
    model = 'gpt-4o-mini',
    input=[
        {
            "system",
            "content": "You are a professional soccer coach tasked with giving the best recommendations for soccer athletes to evolve their skills. Give three main things to work on and give a score from 100."
        }
    ]
)

