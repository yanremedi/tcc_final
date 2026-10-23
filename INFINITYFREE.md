# Publicar no InfinityFree

O projeto agora mantém a versão Node/Express para desenvolvimento local e inclui uma API PHP para hospedagem compartilhada. Use PHP 8 ou superior com PDO MySQL habilitado. No InfinityFree, publique a pasta raiz do projeto mantendo sua estrutura: `.htaccess`, `api/` e `public/`.

## Banco de dados

1. Crie o banco MySQL no painel do InfinityFree.
2. Copie `api/config.example.php` para `api/config.php` e preencha os dados MySQL exibidos no painel, além de uma chave JWT aleatória e longa.
3. `api/config.php` está no `.gitignore`; não o envie para o Git.
4. No phpMyAdmin, selecione o banco criado e importe `banco_de_dados/expedicao.sql`. O arquivo não cria nem seleciona banco, então as tabelas serão instaladas no banco selecionado.
5. Troque qualquer senha que tenha sido compartilhada em capturas de tela antes de publicar.

## Arquivos enviados

- Envie `.htaccess`, `api/` e `public/` para a pasta pública do domínio.
- Envie `api/config.php` separadamente, preenchido com os dados do seu painel.
- Não é necessário enviar `node_modules/`, `.env` ou `api/config.example.php`.
- Após publicar, abra `/api/health`. A resposta deve indicar `status: "ok"`.

A interface usa a API PHP na mesma origem no domínio publicado. Em desenvolvimento local, continua usando a API Node em `localhost:3000`.
