FROM python:3.11-bookworm

LABEL org.opencontainers.image.source=https://github.com/ClashKingInc/ClashKingAPI
LABEL org.opencontainers.image.description="Image for the ClashKing API"
LABEL org.opencontainers.image.licenses=MIT

RUN apt-get update && apt-get install -y libsnappy-dev tini && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8010

ENTRYPOINT ["tini", "--"]
CMD ["python", "main.py"]
