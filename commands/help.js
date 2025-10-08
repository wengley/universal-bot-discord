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
            
            // Filtra os comandos e garante que todos os campos são strings válidas
            const comandosVisiveis = comandos.filter(cmd => cmd.description && cmd.name); 
            
            // Constrói a lista de comandos (Ex: !daily - Recompensa diária)
            const lista = comandosVisiveis.map(command => 
                `\`${prefix}${command.name}\` - ${command.description || 'Sem descrição.'}`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0x0099FF) // Azul
                .setTitle('✨ Lista de Comandos')
                .setDescription(
                    `Use \`${prefix}help [comando]\` para obter mais informações sobre um comando específico.\n\n` + 
                    '**Comandos Disponíveis:**'
                )
                // Usando addFields para garantir que o formato está correto
                .addFields([{
                    name: '\u200B', 
                    value: lista || 'Nenhum comando encontrado.',
                    inline: false,
                }])
                .setFooter({ text: `Solicitado por ${message.author.username}` })
                .setTimestamp();
            
            return message.channel.send({ embeds: [embed] }).catch(console.error);
            
        } else {
            // Se houver argumentos (quer ajuda sobre um comando específico)
            const nomeComando = args[0].toLowerCase();
            const comando = client.commands.get(nomeComando) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(nomeComando));

            if (!comando) {
                return message.reply(`❌ Não consegui encontrar o comando \`${nomeComando}\`.`);
            }

            const embedDetalhe = new EmbedBuilder()
                .setColor(0x00FF00) // Verde
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