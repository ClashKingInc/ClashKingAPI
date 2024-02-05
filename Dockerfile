FROM python:3.11-bookworm

RUN apt-get update && apt-get install -y libsnappy-dev

COPY requirements.txt /app/
WORKDIR /app

RUN pip install -r requirements.txt
COPY . .

EXPOSE 80
CMD ["python3", "main.py"]

