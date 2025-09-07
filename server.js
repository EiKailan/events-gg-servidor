// server.js

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Usando a nova ferramenta que instalamos

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- CONFIGURAÇÃO DA CONEXÃO COM O BANCO DE DADOS REAL ---
const dbConfig = {
    host: 'localhost', // Na Hostinger, geralmente é 'localhost'
    user: 'u178971387_eikailan',
    password: 'E.k@@@180525',
    database: 'u178971387_eventsgg'
};

// Cria um "pool" de conexões para mais eficiência
const pool = mysql.createPool(dbConfig);

// Função para gerar senha aleatória
function gerarSenha() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let senha = '';
    for (let i = 0; i < 6; i++) {
        senha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return senha;
}

// --- ROTAS DA API (AGORA COM BANCO DE DADOS) ---

// Rota para solicitar acesso
app.post('/solicitar-acesso', async (req, res) => {
    const { telefone } = req.body;
    if (!telefone) return res.status(400).json({ error: 'Número de telefone é obrigatório.' });

    try {
        const connection = await pool.getConnection();
        // Verifica se o telefone já existe
        const [rows] = await connection.query('SELECT * FROM usuarios WHERE telefone = ?', [telefone]);
        if (rows.length > 0) {
            connection.release();
            return res.status(409).json({ error: 'Este número de WhatsApp já está cadastrado.' });
        }
        
        // Insere o novo pedido com status 'pendente'
        await connection.query('INSERT INTO usuarios (telefone) VALUES (?)', [telefone]);
        connection.release();

        console.log('Novo pedido de acesso recebido para o telefone:', telefone);
        res.status(201).json({ message: 'Solicitação recebida!' });
    } catch (error) {
        console.error("Erro ao solicitar acesso:", error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// Rota para buscar pedidos pendentes
app.get('/pedidos-pendentes', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.query("SELECT * FROM usuarios WHERE status = 'pendente' ORDER BY data_cadastro ASC");
        connection.release();
        res.json(rows);
    } catch (error) {
        console.error("Erro ao buscar pedidos pendentes:", error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// Rota para aprovar um pedido
app.post('/aprovar-pedido/:id', async (req, res) => {
    const { id } = req.params;
    const { isAdmin } = req.body;
    const senhaProvisoria = gerarSenha();
    const role = isAdmin ? 'admin' : 'jogador';

    try {
        const connection = await pool.getConnection();
        // Atualiza o status do usuário para 'aprovado' e define a senha provisória
        await connection.query(
            "UPDATE usuarios SET status = 'aprovado', senha = ?, role = ?, primeiroLogin = 1 WHERE id = ?", 
            [senhaProvisoria, role, id]
        );
        connection.release();

        console.log(`Usuário ID ${id} aprovado. Senha provisória: ${senhaProvisoria}`);
        res.json({ message: 'Usuário aprovado!', senhaProvisoria });
    } catch (error) {
        console.error("Erro ao aprovar pedido:", error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// Rota para fazer login
app.post('/login', async (req, res) => {
    const { loginIdentifier, senha } = req.body;
    
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.query(
            'SELECT * FROM usuarios WHERE (telefone = ? OR nick = ?) AND status = "aprovado"', 
            [loginIdentifier, loginIdentifier]
        );
        connection.release();

        const usuario = rows[0];
        if (!usuario || usuario.senha !== senha) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        }
        if (usuario.primeiroLogin) {
            return res.json({ success: true, redirect: 'setup', telefone: usuario.telefone });
        }
        res.json({ success: true, redirect: usuario.role === 'admin' ? 'admin.html' : 'lobby.html' });
    } catch (error) {
        console.error("Erro no login:", error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// Rota para finalizar o cadastro
app.post('/finalizar-setup', async (req, res) => {
    const { telefone, nick, novaSenha } = req.body;
    try {
        const connection = await pool.getConnection();
        // Verifica se o nick já existe
        const [nickRows] = await connection.query('SELECT * FROM usuarios WHERE nick = ? AND telefone != ?', [nick, telefone]);
        if (nickRows.length > 0) {
            connection.release();
            return res.status(409).json({ error: 'Este Nickname já está em uso.' });
        }
        
        // Atualiza o usuário
        await connection.query(
            'UPDATE usuarios SET nick = ?, senha = ?, primeiroLogin = 0 WHERE telefone = ?',
            [nick, novaSenha, telefone]
        );
        connection.release();

        console.log(`Usuário ${nick} finalizou o cadastro.`);
        res.json({ success: true, message: 'Cadastro finalizado!' });
    } catch (error) {
        console.error("Erro ao finalizar setup:", error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando! Acesse em http://localhost:${PORT}/index.html`);
});