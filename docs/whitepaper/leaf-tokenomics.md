# LEAF: tokenomics e recompensas de pré-lançamento

Versão de trabalho: 2 de outubro de 2026. As regras de acumulação, bloqueio e
conversão abaixo refletem a decisão do produto. A distribuição percentual é o
plano de alocação atual; datas e mecanismos de lançamento ainda serão definidos.

## Oferta e reservas

A oferta máxima planejada é de **1.000.000.000 LEAF**, com sete casas decimais.
As recompensas fazem parte dessa oferta. Resets não criam novas reservas.

| Destinação | Percentual | LEAF |
| --- | ---: | ---: |
| Testadores iniciais | 5% | 50.000.000 |
| Incentivos futuros aos usuários | 30% | 300.000.000 |
| Tesouraria Leafora | 20% | 200.000.000 |
| Fundadores | 15% | 150.000.000 |
| Equipe e colaboradores | 10% | 100.000.000 |
| Comunidade e integrações | 10% | 100.000.000 |
| Segurança e bug bounty | 5% | 50.000.000 |
| Reserva estratégica | 5% | 50.000.000 |
| **Total** | **100%** | **1.000.000.000** |

Os orçamentos das campanhas devem caber nas respectivas reservas. Cada campanha
define suas ações elegíveis, critérios de validação e quantidades antes da
concessão. Participar de uma ação não implica uma quantidade de LEAF não prevista
nessas regras. Alterações futuras não reduzem recompensas já validamente adquiridas.

## Acumulação e bloqueio

Durante os testes, as recompensas validadas são registradas em um histórico
persistente e vinculadas ao endereço da carteira participante. O dashboard mostra
o total acumulado, o bloqueio e o histórico. Nenhum token LEAF é emitido ou enviado
à carteira nesta fase: não há saldo LEAF transferível na Freighter.

As recompensas permanecem **intransferíveis até o lançamento oficial**. Não podem
ser vendidas, cedidas a outra carteira, sacadas, negociadas ou utilizadas em staking.
Não há desbloqueio automático por data nem por reinicialização da testnet.

Cada ação validada é contabilizada uma única vez. Repetir uma requisição não gera
novo crédito. Novas ações elegíveis acrescentam novas recompensas ao mesmo total.
O encerramento de uma campanha não apaga o que já foi adquirido. Correções de
registros incorretos exigem motivo e preservam o histórico original; não servem
para revogar recompensas válidas ou aplicar novas regras retroativamente.

## Preservação entre resets

O direito acumulado independe do saldo da rede de testes. Uma carteira com 140 LEAF
continua com 140 após o reset. Se ganhar mais 30, passa a 170. Um novo reset mantém
170; mais 20 resultam em 190 LEAF. Não se somam novamente saldos antigos ao total.

A Leafora deve manter o histórico e cópias de segurança externas. A perda do
servidor exige recuperação desse histórico; o reset da testnet não exige refazê-lo.
Comprovantes de ações na blockchain precisam ser preservados durante a validação,
antes que a rede de testes apague seu histórico.

## Distribuição no lançamento

**Cada 1 LEAF de recompensa válida acumulada corresponde a 1 LEAF a entregar na
mainnet**, mantendo exatamente as frações registradas. O lançamento oficial
definirá e publicará o encerramento da apuração e o procedimento de entrega.
Não há data de lançamento definida nesta versão.

Antes da distribuição, será conferido um demonstrativo com a quantidade devida a
cada carteira e o total geral. Entregas confirmadas na mainnet serão registradas
para impedir pagamentos duplicados. Uma transação pendente não será tratada como
falha nem repetida sem conferência. Pagamentos antigos na testnet não descontam
quantidades devidas na mainnet.

A carteira que adquiriu as recompensas é a destinatária. O participante deve
preservar seu acesso a ela. Requisitos de recebimento na mainnet serão informados
antes da entrega; a aprovação de uma recompensa não ativa uma conta nessa rede.

O demonstrativo atual é apenas um registro para conferência. A emissão, entrega
e liberação na mainnet ainda exigem uma versão específica do sistema e aprovação
do lançamento. Não existe transferência ou resgate antecipado nesta versão.

## Outras reservas e evolução

O lançamento não libera automaticamente todas as reservas. Para fundadores, a
proposta continua sendo carência de 12 meses seguida de 48 liberações mensais,
com início a definir. As condições da equipe serão individualizadas. Esses
cronogramas ainda não estão implementados em contratos.

Eventuais mecanismos de staking, utilidade e distribuição de resultados da
Leafora serão definidos separadamente. Esta versão não fixa percentual de lucro,
retorno, preço de mercado ou data de início desses mecanismos.
