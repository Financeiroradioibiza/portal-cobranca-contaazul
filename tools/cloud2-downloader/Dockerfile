FROM node:22-alpine

WORKDIR /app

# Instala yt-dlp + ffmpeg (para o provider youtube via CLI)
RUN apk add --no-cache python3 ffmpeg curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# O schema.prisma deve ser colocado em prisma/schema.prisma antes do build.
# No CI / deploy, execute:
#   cp ../../prisma/schema.prisma prisma/schema.prisma
# antes de fazer o docker build.
RUN npx prisma generate

EXPOSE 3002

CMD ["node", "--import", "tsx/esm", "index.ts"]
