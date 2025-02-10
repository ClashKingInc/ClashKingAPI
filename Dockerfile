# Use the official Python 3.11 image
FROM python:3.11-bookworm

# Metadata labels for the image
LABEL org.opencontainers.image.source="https://github.com/ClashKingInc/ClashKingAPI"
LABEL org.opencontainers.image.description="Image for the ClashKing API"
LABEL org.opencontainers.image.licenses="MIT"

# Install system dependencies
RUN apt-get update && apt-get install -y libsnappy-dev

# Set the working directory
WORKDIR /app

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Define the environment variable for app mode (default to development)
ARG APP_ENV=development
ENV APP_ENV=${APP_ENV}

# Expose the ports used by different environments
EXPOSE 8000 8073 8010

# Dynamically set the correct port based on APP_ENV
CMD ["sh", "-c", "python main.py --port=$( [ \"$APP_ENV\" = \"development\" ] && echo 8073 || ( [ \"$APP_ENV\" = \"local\" ] && echo 8000 || echo 8010 ) )"]
