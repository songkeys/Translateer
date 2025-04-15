# Build stage
FROM denoland/deno:latest as builder
WORKDIR /app
COPY . .
RUN deno install

# Production stage
FROM denoland/deno:latest
WORKDIR /app
COPY --from=builder /app .
CMD ["deno", "run", "-A", "./src/app.ts"]
