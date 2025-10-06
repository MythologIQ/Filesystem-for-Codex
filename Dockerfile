FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm i --production
COPY dist ./dist
COPY policy.json .
ENV PORT=8080
EXPOSE 8080
CMD ["node","dist/server.js"]
