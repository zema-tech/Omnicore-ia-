# Omnicore su qualsiasi host (stile: node:22-slim + python3, zero build).
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

WORKDIR /app/omnicore
RUN npm ci

# Stato persistito fuori dal layer (monta un volume su /app/omnicore/data).
VOLUME ["/app/omnicore/data"]

EXPOSE 8100
ENV OMNICORE_PORT=8100 OMNICORE_HOST=0.0.0.0
# OBBLIGATORIO: il server rifiuta di legarsi fuori localhost senza token.
# ENV OMNICORE_API_TOKEN=cambia-questo-valore

CMD ["python3", "server.py"]
