# PRD — Solara OS

**O que a Solara quer, escrito para pessoas.** Quem lê isto deve entender o problema e o resultado esperado sem saber nada de tecnologia.

## 1. Quem somos

A Solara Distribuidora vende peças e insumos industriais (fixadores, vedações, correias, lubrificantes, EPIs, rolamentos) para indústrias, oficinas e revendas de Minas Gerais. Sede em Betim, 18 anos de operação, 40 pessoas. O ERP é de 2011: guarda clientes, produtos, pedidos e títulos a receber, e exporta tudo em CSV.

## 2. O problema

**Em Vendas**, a Marcela recebe cerca de 30 pedidos de orçamento por dia, por e-mail, WhatsApp e telefone. Para cada um ela lê o texto, descobre o que o cliente quer, confere estoque e preço no ERP, confere a condição do cliente e escreve a resposta. São 10 minutos por pedido, cinco horas por dia.

**Em Financeiro**, o Rafael fecha o mês batendo o extrato do banco com os títulos a receber, linha por linha, numa planilha. Leva dois dias. O que ele não consegue explicar (um PIX sem identificação, um valor que não bate) fica em aberto ou vai errado para o balanço.

Nos dois casos, ninguém sabe depois quem respondeu o quê, com base em que informação, nem quanto tempo levou.

## 3. O que queremos

Um sistema próprio da Solara, o **Solara OS**, onde agentes de IA fazem a parte repetitiva e as pessoas decidem.

### 3.1 Vendas
- Um pedido de orçamento entra no sistema (importado do ERP ou digitado por um vendedor).
- O sistema entende o pedido, consulta estoque, preço e condição do cliente, e escreve uma proposta de resposta.
- Uma verificação automática garante que a resposta não promete o que a Solara não pode cumprir: prazo sem estoque, desconto acima do limite do cliente, produto que não existe.
- A resposta vai para uma fila. A Marcela aprova, edita ou rejeita. **Nenhuma resposta sai sem uma pessoa aprovar.**
- Pedidos que não são orçamento (reclamação, spam, produto fora do ramo) são identificados e não seguem o fluxo normal.

### 3.2 Financeiro
- O Rafael sobe o extrato do banco no formato em que o banco envia.
- O sistema limpa o arquivo e casa cada crédito com um título a receber. O que bate é baixado.
- O que não bate vira uma divergência. Para cada divergência, o sistema propõe uma explicação (pagamento parcial, dois títulos numa transferência, duplicidade, juros, depósito não identificado) com um grau de confiança.
- Um relatório do mês resume o que fechou e o que precisa de ação.
- Cada explicação vai para a mesma fila de aprovação. O Rafael aceita, corrige ou rejeita.
- Se a empresa não tiver ERP, o Rafael pode subir também a planilha de títulos.

### 3.3 Para toda a empresa
- Login por e-mail e senha. Um administrador cadastra quem entra e em quais áreas.
- Toda ação de um agente fica registrada: qual agente, o que recebeu, o que devolveu, quanto tempo levou, quanto custou, quem o chamou.
- Uma tela mostra, em tempo real, qual agente está trabalhando em cada pedido.
- Novas áreas (RH, Jurídico, Operações) devem poder ser adicionadas reaproveitando o que já existe.

## 4. O que fica fora desta versão

- Receber e-mail automaticamente. Pedidos entram do ERP ou pelo sistema.
- Enviar a resposta ao cliente. A Marcela copia a resposta aprovada.
- Integração automática com o ERP. A carga é por CSV.
- Login por Google ou outro provedor.
- Qualquer área além de Vendas e Financeiro.

## 5. Como saber se deu certo

| hoje | meta |
|---|---|
| 10 min por orçamento | 1 min (o tempo de ler e aprovar) |
| 2 dias de fechamento | minutos, com cada divergência explicada |
| respostas sem revisão | zero: toda resposta passa por uma pessoa |
| nenhum registro | toda execução rastreável: quem, o quê, quando, quanto custou |

## 6. Princípios

1. **A máquina prepara, a pessoa decide.** Nenhuma decisão de negócio sai do sistema sem aprovação humana.
2. **Tudo registrado.** Se não dá para explicar como uma resposta foi montada, ela não serve.
3. **Um motor, várias áreas.** A segunda área deve custar uma fração da primeira.
4. **Modelo só onde precisa interpretar.** Limpar arquivo, casar valores, verificar estoque é código, não IA.
