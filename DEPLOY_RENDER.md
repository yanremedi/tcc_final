# Publicação no Render

## 1. Banco MySQL
Crie um banco MySQL gratuito em um provedor que aceite conexões externas e forneça uma URL semelhante a:

`mysql://USUARIO:SENHA@HOST:PORTA/NOME_DO_BANCO`

O aplicativo cria automaticamente as tabelas na primeira inicialização.

## 2. GitHub
Envie este projeto para um repositório GitHub privado ou público.

## 3. Render
1. Acesse https://dashboard.render.com/ e entre com GitHub.
2. Clique em **New > Blueprint** e selecione o repositório.
3. Render detectará o arquivo `render.yaml`.
4. Informe o valor da variável `DATABASE_URL`.
5. Confirme o deploy.

Use `DB_SSL=true` para bancos gerenciados que exigem TLS. A aplicação ficará disponível em uma URL `https://...onrender.com`.
