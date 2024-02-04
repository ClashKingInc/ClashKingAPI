FROM ubuntu:22.04

WORKDIR /app

RUN apt-get update && apt-get install -y libsnappy-dev

RUN apt-get update && \
    apt-get install -y \
    build-essential \
    libffi-dev \
    python3 \
    python3-pip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/

RUN pip3 install -r requirements.txt

COPY . .

CMD ["python3", "main.py"]
