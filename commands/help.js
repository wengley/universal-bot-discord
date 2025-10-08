// help.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: "help",
    description: "Mostra a lista de comandos ou informações sobre um comando específico.",
    aliases: ["comandos", "ajuda"],
    
    async execute(message, args, client, db) {
        
        const prefix = '!'; 
        
        // Se não houver argumentos (quer a lista geral)
        if (!args.length) {
            
            const comandos = client.commands;
            
            // Filtra os comandos: APENAS comandos com nome e descrição definidos para evitar crash.
            const comandosVisiveis = comandos.filter(cmd => cmd.description && cmd.name); 
            
            // Se, por algum motivo, não houver comandos visíveis, previna o crash.
            if (comandosVisiveis.length === 0) {
                 const embedErro = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('❌ Nenhum Comando Encontrado')
                    .setDescription('Nenhum comando visível foi carregado. Verifique os logs se o bot está caindo.');
                return message.channel.send({ embeds: [embedErro] }).catch(console.error);
            }

            // Constrói a lista de comandos
            const lista = comandosVisiveis.map(command => 
                `\`${prefix}${command.name}\` - ${command.description || 'Sem descrição.'}`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('✨ Lista de Comandos')
                .setDescription(
                    `Use \`${prefix}help [comando]\` para obter mais informações sobre um comando específico.\n\n` + 
                    '**Comandos Disponíveis:**'
                )
                .addFields([{
                    name: '\u200B', 
                    value: lista, // Lista agora é garantidamente preenchida ou evitada pelo IF acima
                    inline: false,
                }])
                .setFooter({ text: `Solicitado por ${message.author.username}` })
                .setTimestamp();
            
            return message.channel.send({ embeds: [embed] }).catch(console.error);
            
        } else {
            // ... (Ajuda de comando específico - a parte que não estava falhando)
            const nomeComando = args[0].toLowerCase();
            const comando = client.commands.get(nomeComando) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(nomeComando));

            if (!comando) {
                return message.reply(`❌ Não consegui encontrar o comando \`${nomeComando}\`.`);
            }

            const embedDetalhe = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle(`Comando: ${comando.name}`)
                .setDescription(comando.description || 'Sem descrição detalhada.')
                .addFields(
                    { name: 'Uso', value: `\`${prefix}${comando.name} ${comando.usage || ''}\``, inline: false },
                    { name: 'Aliases', value: comando.aliases ? comando.aliases.join(', ') : 'Nenhuma', inline: true }
                )
                .setFooter({ text: 'Informações detalhadas do comando.' })
                .setTimestamp();

            return message.channel.send({ embeds: [embedDetalhe] }).catch(console.error);
        }
    },
};