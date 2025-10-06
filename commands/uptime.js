module.exports = {
    name: "uptime",
    description: "Mostra há quanto tempo o bot está online.",
    aliases: ["tempoativo"],
    async execute(message, args, client) {
        
        // Converte milissegundos para dias, horas, minutos e segundos
        let totalSeconds = (client.uptime / 1000);
        let days = Math.floor(totalSeconds / 86400);
        totalSeconds %= 86400;
        let hours = Math.floor(totalSeconds / 3600);
        totalSeconds %= 3600;
        let minutes = Math.floor(totalSeconds / 60);
        let seconds = Math.floor(totalSeconds % 60);

        let uptimeMessage = `Estou online há: ${days} dias, ${hours} horas, ${minutes} minutos e ${seconds} segundos.`;

        message.reply(uptimeMessage);
    },
};