# Use Node.js 22 LTS como base
FROM node:22-alpine

# Instala bibliotecas necessárias para o Prisma (openssl)
RUN apk add --no-cache openssl

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos de dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instala todas as dependências
RUN npm install

# Copia o restante do código fonte
COPY . .

# Gera o cliente Prisma
RUN npx prisma generate

# Compila o TypeScript (Se houver script de build)
# RUN npm run build

# Expõe a porta do servidor
EXPOSE 3000

# Comando de inicialização
# Sincroniza o banco de dados e inicia o servidor
CMD npx prisma db push && npx tsx src/server.ts
