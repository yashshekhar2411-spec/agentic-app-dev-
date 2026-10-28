# The backend as a container, for cloud hosting (Fly.io, Render, Railway...): the app keeps working when the laptop is off.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATA_DIR=/data
WORKDIR /app

COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .

# Contacts, roles, team, scheduled calls... (mount a persistent volume here)
RUN mkdir -p /data
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips '*'"]
