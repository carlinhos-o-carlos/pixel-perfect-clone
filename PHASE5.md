# Fase 5 — Patrimônio, Dívidas e Metas

## Implementado
- **Bens** (`/mais/ativos`): criar, editar, atualizar valor (novo registro datado), histórico, arquivar/reativar, excluir com confirmação (remove bem + histórico juntos). Opção "já está no saldo de uma conta" lista o bem sem somá-lo de novo.
- **Dívidas** (`/mais/dividas`): criar com saldo, data de referência, juros (% a.m./a.a.), vencimento e observações; entrada opcional na conta (`loan_proceeds`, não é receita, criada uma única vez); pagamentos com divisão principal/juros/encargos ou "a classificar"; classificar depois (uma vez); atualizar saldo manual; quitar (registra saldo 0, preserva histórico); reabrir; excluir só se nunca usada.
- **Patrimônio líquido** (`/mais/patrimonio`): ativos, passivos, total estimado e detalhamento por moeda, com data do valor mais recente.
- **Metas** (`/mais/metas`): criar/editar/concluir/arquivar/reativar/excluir; contribuições (negativas = retirada) com edição e exclusão; progresso limitado a 100% com excedente indicado.
- Menu **Mais** com os quatro acessos. Lançamentos de dívida em "Lançamentos" não abrem o editor comum (são geridos em Dívidas).

## Banco de dados
Dexie **v3** (v1/v2 intactas): novas tabelas `assetValuations` e `debtBalances`, índice `archived` em `assets`. A migração só acrescenta: bens antigos recebem `archived=false` e um primeiro registro de valor; dívidas antigas recebem o saldo inicial como primeiro registro. `settings.schemaVersion` não é alterado pela v3 (a versão do Dexie é a referência), preservando o teste existente da v2.

## Regras de cálculo
- Patrimônio (por moeda, sem conversão) = saldos positivos de contas + bens não marcados como já em conta + pagamentos de dívida a classificar − saldos negativos de contas (cartões/cheque especial, contados só aí) − dívidas ativas.
- Saldo da dívida = último saldo informado − principal dos pagamentos classificados após essa data (mínimo 0). Pagamento a classificar não reduz a dívida; o valor fica como "a classificar" para o patrimônio não cair pelo pagamento inteiro. Após classificar, só juros e encargos reduzem o patrimônio.
- Pagamento duplicado: cada formulário usa um identificador único; reenvio não cria segunda linha.
- Contribuições são reservas: não são receitas nem bens. O total reservado em metas não arquivadas não pode passar da soma dos saldos positivos das contas na mesma moeda.
- Contas arquivadas ficam fora do patrimônio (mesma regra dos totais de Contas).

## Validação
- `npm test`: 84 testes em 10 arquivos (15 novos em `src/data/__tests__/phase5.test.ts`).
- `npm run lint`: 0 erros, 9 avisos antigos.
- `vite build`: concluído sem erros.
- Navegador 390×844: conta R$1.000, empréstimo R$500 com entrada, pagamento R$100 a classificar, carro R$2.000, meta com contribuição acima do disponível recusada e R$300 aceita; patrimônio R$3.000 após recarregar; sem erros e sem rolagem lateral.

## Limitações / adiado
- Sem simulação de amortização, estratégias de quitação, projeções de metas ou independência financeira (fases seguintes).
- Juros informados são apenas registro; não são aplicados automaticamente ao saldo.
- Metas não se vinculam a contas específicas (modo manual apenas).
- Contribuições não são lançamentos: não movem dinheiro entre contas.
- Pagamentos de dívida não podem ser editados/excluídos pela tela; corrija com "Atualizar saldo".

## Validação manual
1. Mais › Contas: crie uma conta com saldo.
2. Mais › Dívidas: crie um empréstimo marcando "Registrar entrada", registre um pagamento sem divisão, veja "a classificar", depois "Histórico › Classificar".
3. Mais › Bens: cadastre um bem, use "Atualizar valor" e confira o "Histórico".
4. Mais › Metas: crie uma meta e tente contribuir mais que o saldo (deve recusar).
5. Mais › Patrimônio líquido: confira os componentes; recarregue a página.
