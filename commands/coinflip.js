module.exports = {
    name: "coinflip",
    description: "Joga cara ou coroa.",
    aliases: ["moeda", "cf"],
    async execute(message, args, client) {
        
        // Gera um número aleatório entre 0 e 1
        const resultado = Math.random() > 0.5 ? 'Cara' : 'Coroa';
        
        message.reply(`A moeda caiu em: **${resultado}**!`);
    },
};