FROM python:3.12.8-slim

LABEL org.opencontainers.image.source=https://github.com/ClashKingInc/ClashKingAPI
LABEL org.opencontainers.image.description="Image for the ClashKing API"
LABEL org.opencontainers.image.licenses=MIT

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install system dependencies and build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsnappy-dev \
    git \
    curl \
    build-essential \
    gcc \
    python3-dev \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# Copy only the requirements.txt file first
COPY requirements.txt .

# Install dependencies using uv with the --system flag
RUN uv pip install -r requirements.txt --system \
    && apt-get remove -y build-essential gcc python3-dev \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* /root/.cache/pip

# Copy the rest of the application code into the container
COPY . .

EXPOSE 8010

CMD ["python3", "main.py"]