# CRM de prospecção para sites e lojas virtuais

## Login simples e banco dos leads

O CRM usa um único login de e-mail e senha. O administrador é criado na primeira inicialização usando `ADMIN_EMAIL` e `ADMIN_PASSWORD` (mínimo de 12 caracteres) definidos **na Vercel**, nunca no código. Se `CRM_ADMIN_GOOGLE_EMAIL` já estiver configurada, ela também serve como e-mail inicial e você precisa adicionar apenas `ADMIN_PASSWORD`; o login não passa pelo Google. Em **Configurações** ele pode trocar a senha. Se perdê-la, altere `ADMIN_PASSWORD` na Vercel e faça um novo deployment: o sistema redefinirá a senha e encerrará as sessões antigas. Google OAuth, Resend e códigos por WhatsApp não são necessários.

O banco persistente é o projeto Supabase [`crm-ecom`](https://supabase.com/dashboard/project/nhuputjibipbyxtocsac), na região de São Paulo. Importe JSON da Apify ou use as buscas do CRM: campanhas, leads, observações, listas e atividades são armazenados no mesmo PostgreSQL. No deployment Vercel, `SUPABASE_DB_URL` é obrigatória; sem ela a API retorna 503 e não grava no Turso. Os dados antigos de teste não serão migrados.

Para ativar: configure `SUPABASE_DB_URL` com a URI privada do **Session pooler** do Supabase em Preview e Production; configure `ADMIN_EMAIL` e `ADMIN_PASSWORD` nos mesmos ambientes; mantenha `CRM_CREDENTIALS_KEY` para cifrar as chaves da Apify/Firecrawl salvas no painel. Teste primeiro a prévia, depois a produção. A proteção da Vercel em **All Deployments** intercepta a tela do CRM; após testar a autenticação na prévia, configure **Standard Protection** para mostrar o login próprio no domínio principal. A prévia pode permanecer protegida pela Vercel. Nunca envie a senha ou a URI do banco pelo chat.

## Objetivo

Encontrar empresas e profissionais locais que ainda não possuem site próprio ou loja virtual, reunir evidências públicas sobre a presença digital de cada negócio e organizar a venda consultiva de sites e lojas criadas pelo operador na Nuvemshop ou Yampi. Oferta inicial: implantação entre R$ 1.500 e R$ 3.000, com valor definido na proposta individual.

**Estado atual:** a produção ainda usa a versão anterior. A prévia desta mudança passa a usar somente e-mail/senha e Supabase para persistência. A execução ao vivo das integrações exige as chaves reais e um teste de ponta a ponta.

## Iniciar a aplicação

Requisitos: Python 3.12+ e `pip install -r requirements.txt`.

1. Configure as variáveis de `.env.example` no ambiente. Para uma primeira execução local, use um e-mail de operador e uma senha exclusiva de pelo menos 12 caracteres. O arquivo `.env` **não é carregado automaticamente**: exporte as variáveis no shell, no gerenciador de serviço ou na hospedagem.
2. Execute `python server.py` e abra `http://127.0.0.1:8080` (ou o HOST/PORT definidos). O diretório `data/` será criado automaticamente para o SQLite.
3. Entre com as credenciais configuradas; altere a senha em Configurações após o primeiro acesso. Para redefinir uma senha esquecida, mude `ADMIN_PASSWORD` na Vercel e faça novo deployment.
4. Insira as chaves da Apify e Firecrawl em **Configurações**. Em execução local, defina antes uma variável `CRM_CREDENTIALS_KEY` com um valor aleatório e durável de pelo menos 32 caracteres. Como alternativa, configure `APIFY_TOKEN` e `FIRECRAWL_API_KEY` no servidor. Sem chaves, cadastro manual, importação CSV, listas, CRM, mensagens e exportação funcionam normalmente.
5. Para testar: `python -m unittest discover -s tests -v` e `node --check static/app.js` se tiver Node instalado.

Exemplo local (troque os valores antes de usar):

```bash
export ADMIN_EMAIL='operador@empresa.com'
export ADMIN_PASSWORD='uma-senha-exclusiva-com-mais-de-12-caracteres'
python server.py
```

### Operação em hospedagem

Use HTTPS em um proxy reverso, `COOKIE_SECURE=1`, banco SQLite em volume persistente e **um único processo** da aplicação (o worker interno já processa as campanhas). Faça backup regular do arquivo SQLite com a API de backup do SQLite, proteja o volume e defina política de retenção. Não publique o serviço diretamente sem TLS. Restrinja o acesso à equipe autorizada; o MVP suporta um operador inicial e sessões com senha/CSRF. A lógica de bloqueio por telefone impede reimportação do número; empresas sem telefone podem exigir remoção ou bloqueio adicional no futuro.

### Publicar na Vercel

O projeto inclui `app.py` (entrada WSGI), `pyproject.toml`, `requirements.txt`, `vercel.json` (preset Flask) e `public/` com os arquivos da interface para a CDN. Ao modificar `static/`, copie as alterações equivalentes para `public/` antes de publicar. Em **Project → Settings → Environment Variables**, configure primeiro para Preview e, após o teste, para Production:

| Variável | Uso |
| --- | --- |
| `SUPABASE_DB_URL` | URI PostgreSQL privada do Session pooler do projeto `crm-ecom`; necessária para API. |
| `CRM_PUBLIC_HOST` | Opcional: endereço principal exato; padrão `crm-ecom-ten.vercel.app`. |
| `ADMIN_EMAIL` | Seu e-mail de login, configurado no servidor para o primeiro acesso. |
| `ADMIN_PASSWORD` | Senha inicial com ao menos 12 caracteres; troque pela interface após entrar. |
| `APIFY_TOKEN` | Token privado da Apify; habilita campanhas. |
| `FIRECRAWL_API_KEY` | Chave privada da Firecrawl; habilita enriquecimento. |
| `CRM_CREDENTIALS_KEY` | Chave privada, aleatória e estável para cifrar as credenciais de integrações. |
| `COOKIE_SECURE` | Defina `1` em HTTPS (na Vercel já é o padrão). |

Salve as variáveis na hospedagem e crie um **novo deployment** para que entrem em vigor. Nunca insira a senha do banco, a chave de cifragem ou chaves de integrações em `.env.example`, no repositório ou em prints. A API devolve 503 até a conexão Supabase estar válida. Cada campanha pode gerar cobranças na Apify e Firecrawl; valide uma busca pequena antes de aumentar o volume.

**Acesso na Vercel:** a tela inicial pede somente e-mail e senha. A proteção própria da Vercel para a produção precisa ser alterada para Standard Protection depois de testar a prévia; enquanto estiver em All Deployments, a Vercel mostra seu login antes da tela do CRM.

**Atenção aos ambientes:** a produção acompanha `main` e a mudança de banco e login está na branch `supabase-google-migration` (Preview). Variáveis adicionadas em Preview precisam de novo deployment dessa branch. O Turso permanece apenas como configuração legada da produção até a troca.

As buscas da Apify e do Firecrawl são cobradas nas contas dos provedores. O limite de 1 a 100 empresas restringe a leitura e os resultados pretendidos; custos finais e limites efetivos do ator precisam ser validados na conta conectada. O app não envia mensagens automaticamente nem comprova que um número tem WhatsApp. A API4com é usada à parte para ligação.

## Fluxo

### Importação manual pela Apify

Em **Importar JSON**, cole o array exportado do dataset da Apify (ou um objeto que contenha `items`/`data`), dê um nome à lista e informe cidade/UF padrão se esses campos não constarem no JSON. A importação aceita até 500 empresas e faz deduplicação por ID do local, telefone/nome e nome/localidade. Campos como `title`, `categoryName`, `address`, `phone`, `website`, `url`, `placeId`, `totalScore` e `reviewsCount` são mapeados para o CRM. Nenhuma chamada à Apify é feita por esse caminho.

Com Firecrawl configurado, mantenha a tela aberta: o CRM pesquisa uma empresa por vez e mostra progresso, classificação e links de evidência no detalhe do lead. Se sair, volte à tela para continuar; HTTP 429 da Firecrawl pausa o processamento até você clicar em **Retomar pesquisa**. Uma pesquisa sem evidência permanece **Incerto**, e “Sem site identificado” requer conferência manual. Chaves de API nunca devem ser coladas com o JSON de empresas.

No **Banco de leads**, o botão **Instagram** consulta a Firecrawl com o nome, endereço e localidade daquele lead. O CRM exibe até cinco perfis candidatos e a fonte da busca. Você abre e confere o perfil antes de clicar em **Confirmar este perfil**; a busca sozinha não grava um Instagram no lead. O histórico guarda a indicação do candidato e a confirmação do operador.

```text
Busca por cidade + segmento
  → Apify: Google Maps e atores configuráveis para diretórios públicos
  → Normalização, proveniência e deduplicação
  → Firecrawl: busca web e leitura de páginas públicas relevantes
  → Classificação com evidências e revisão humana
  → Banco de leads → pipeline comercial → contato individual → proposta → fechamento
```

A Apify cuida da **descoberta estruturada** de negócios. O Firecrawl faz a **pesquisa e o enriquecimento**: procura domínio próprio, Instagram, Facebook, WhatsApp divulgado, catálogo, página agregadora, marketplace e loja virtual. O Firecrawl também pode investigar leads importados manualmente, sem exigir uma nova execução da Apify. Cada fonte pode falhar ou devolver dados incompletos; registrar resultado parcial e motivo do erro.

## Busca e dados de cada lead

Filtros da campanha: cidade/UF, bairro opcional, segmento, termos de busca, fonte, limite de resultados e orçamento máximo por execução. A configuração do ator da Apify deve ser explícita e versionada; atores de diretórios diferentes têm entradas e saídas distintas.

Campos mínimos:

- Identidade: nome comercial, categoria, endereço, cidade/UF, identificador externo (quando fornecido), coordenadas opcionais.
- Contato: telefone bruto, telefone normalizado, tipo presumido (celular/fixo/desconhecido), Instagram e outros canais divulgados.
- Presença digital: domínio próprio, link de perfil social, agregador/Linktree, catálogo, marketplace e plataforma de e-commerce detectada.
- Contexto comercial: avaliações e nota quando presentes na fonte, classificação, confiança, evidências, responsável, data da última verificação.
- CRM: etapa, interesse, produto ofertado (site institucional / catálogo / Nuvemshop / Yampi), valor estimado, próximos passos, notas, data do último contato e origem da campanha.

Cada dado enriquecido mantém URL da fonte, data de coleta e, quando possível, trecho curto ou sinal que sustenta a conclusão. Dados conflitantes ficam visíveis para revisão; não substituir silenciosamente uma informação confirmada pelo operador.

## Qualificação

Estados de presença digital distintos:

| Estado | Regra operacional | Prioridade inicial |
| --- | --- | --- |
| Sem site identificado | Busca não encontrou domínio nem loja vinculados de forma convincente | Alta, **pendente de conferência** |
| Apenas rede social/agregador | Instagram, Facebook ou Linktree sem site próprio identificado | Alta |
| Site institucional, sem loja | Domínio próprio encontrado, sem checkout ou catálogo próprio confirmado | Oferta de e-commerce |
| Vende em marketplace | Loja em marketplace, sem e-commerce próprio confirmado | Oferta de loja própria |
| Loja virtual encontrada | E-commerce próprio identificado | Baixa para oferta de criação |
| Incerto | Resultados conflitantes, homônimos ou pesquisa incompleta | Revisar antes de abordar |

“Não encontrado” não significa “não existe”. Só usar a afirmação “não possui site” após conferência humana. Instagram e Linktree não são classificados como domínio próprio. Ter loja em marketplace não é equivalente a ter e-commerce próprio. Uma loja em Nuvemshop ou Yampi identificada deve marcar “loja virtual encontrada”.

A pontuação é configurável e explicável, nunca uma caixa-preta: maior prioridade para ausência provável de site próprio, existência de canal de contato público, comércio ativo e adequação da oferta ao segmento; menor prioridade para loja própria encontrada ou dados incertos. Exibir os fatores que influenciaram a pontuação. O número de avaliações pode ajudar a ordenar negócios ativos, mas não comprova potencial de compra.

Deduplicar primeiro por identificador externo da fonte; depois por domínio ou telefone; por fim por nome normalizado + cidade/endereço com revisão para homônimos. Reexecuções devem atualizar o mesmo lead e preservar notas, etapas e histórico humano.

## Referência de estrutura: LeadHunter v2

Referência funcional e de organização: https://leaddhunterv2.lovable.app/painel (consultada em 27/09/2026). A interface pública mostra menu lateral fixo no desktop, menu recolhível no celular, cabeçalho com título e subtítulo, fundo escuro, cartões, destaque em verde-azulado e fontes Space Grotesk/DM Sans. O painel apresenta indicadores no topo e, abaixo, duas áreas: leads recentes e atividade recente. Replicar a hierarquia e os padrões de navegação em uma interface própria; não copiar código, marca ou mecanismo comercial de licença do projeto de referência.

| Área observada na referência | Implementação adaptada para este CRM |
| --- | --- |
| Painel | Indicadores de empresas encontradas, leads salvos, sem site identificado, contatos iniciados, propostas, clientes e score médio; leads recentes e atividade recente. Cards devem ligar a listas filtradas. |
| Procurar Clientes | Formulário nicho + cidade/UF; campanha Apify, progresso do enriquecimento Firecrawl; filtros por telefone, presença de site/loja, nota, avaliações e score; cartões de resultados com salvar, ver fontes, preparar WhatsApp e ligar. O filtro “sem site” usa o estado “sem site identificado” até revisão. |
| Meus Leads | Tabela/lista pesquisável de contatos salvos com filtros, seleção, status digital, score, responsável e ações individuais; detalhe da empresa com evidências, histórico e proposta. |
| Listas | Grupos manuais por campanha, cidade, segmento e prioridade, sem duplicar o cadastro de empresas. |
| CRM | Quadro com cartões movidos por etapa, responsável, valor estimado, último contato e próxima ação; histórico preservado. |
| Explorar Nichos | Sugestões de segmentos e dados agregados das campanhas já realizadas; atalho para iniciar busca no nicho selecionado. |
| Mensagens IA | Dados da oferta, tom escolhido e sugestões baseadas apenas nas evidências do lead; editor e revisão individual antes de abrir o WhatsApp. Não enviar mensagens automaticamente. |
| Histórico | Linha do tempo de buscas, enriquecimentos, revisões, mensagens preparadas, chamadas registradas e alterações do pipeline. |
| Exportações | CSV dos leads filtrados com fontes e datas, respeitando bloqueios; registro de quando e por quem foi exportado. |
| Analytics | Funil e conversão por cidade, nicho, fonte, produto e período; custo por lead qualificado e valores de propostas/ganhos. |
| Configurações | Credenciais de integração protegidas no servidor, limites de busca, templates e equipe. |

As páginas “Minha Licença” e “Créditos” são componentes comerciais da referência. Para uso interno, substituir por **Uso e custos** (execuções e créditos consumidos em Apify/Firecrawl) e **Configurações**; só haverá licença de usuário se surgir um produto de assinatura separado. No painel de referência, a busca usa nicho e localização e mostra resultados com dados como cidade, nota, telefone, site e ações; o CRM é um quadro com cartões arrastáveis. Esses padrões guiam os critérios de interface acima.

**Navegação prioritária do MVP:** Painel → Procurar Clientes → Meus Leads → Listas → CRM → Mensagens → Histórico → Analytics → Configurações. Explorar Nichos e Exportações podem chegar na etapa seguinte, mantendo seus lugares previstos no menu. A UI mostra estados de carregamento, vazio e falha; não exibe contagens fictícias. Foi adicionada a área Integrações com cards Apify, Firecrawl, importação CSV, FlowExtract opcional e Tooplate para prompts de sites institucionais.

## Telas do MVP

1. **Campanhas:** criar busca por cidade e segmento, acompanhar execução, quantidade descoberta, enriquecida, duplicada, pendente de revisão e falha; exibir consumo e interromper novas buscas.
2. **Lista de leads:** filtros por cidade, segmento, estado digital, nota, canal disponível, fonte, etapa e responsável; ordenação por oportunidade e exportação de dados selecionados.
3. **Detalhe do lead:** dados de origem, links clicáveis, evidências com data, presença digital, classificação editável, notas, histórico e próximos passos.
4. **Pipeline:** Novo → Pesquisado → Qualificado → Contato iniciado → Respondeu → Reunião/diagnóstico → Proposta enviada → Negociação → Ganho/Perdido. Registrar motivo de perda e permitir reagendamento.
5. **Contato individual:** botão “Preparar WhatsApp” por lead, editor de mensagem personalizada e abertura manual do link de conversa após revisão; botão “Ligar” usando o número exibido. Registrar tentativa e resultado. Não disparar mensagens em massa.

Modelo editável de primeira mensagem: “Olá! Vi a [nome da empresa] em [cidade] e gostei de [observação real]. Trabalho com criação de sites e lojas virtuais. Posso te mostrar uma ideia de como apresentar seus produtos online?” A observação deve ser real e revisada pelo operador; nunca inventar elogios ou alegar que a empresa não tem site com base apenas na busca.

**WhatsApp:** gerar link de conversa somente para número brasileiro plausível, em formato internacional (55 + DDD + número). Isso valida apenas a sintaxe; não confirma que o número possui WhatsApp, está ativo ou pertence ao negócio. Quando o contato for fixo ou incerto, ocultar o botão até confirmação manual e oferecer cópia do número.

**Ligação:** permitir copiar/abrir o número para discagem manual. A API4com é a ferramenta de VoIP usada fora do CRM; a integração com sua API e o disparo automático de chamadas não fazem parte do MVP.

## Integrações e execução

- Chaves `APIFY_TOKEN` e `FIRECRAWL_API_KEY` somente no servidor; nunca no navegador, no git ou em URLs de log.
- O backend cria uma execução identificável; inicia o ator Apify configurado, acompanha status, lê o dataset por páginas e salva leads normalizados.
- Enfileira enriquecimento Firecrawl com limites de concorrência e custo. Pesquisas direcionadas usam nome + cidade + categoria; confirmar associação ao negócio antes de atribuir domínio/Instagram. Para URLs relevantes e acessíveis, extrair título, links públicos e conteúdo necessário.
- Registrar execução, fonte, versão de regra, tentativas e custo estimado; aplicar timeout, repetição limitada e retomada idempotente.
- Respeitar as condições das fontes e limitar a coleta a dados comerciais públicos pertinentes. Prover correção, exclusão e bloqueio de contato no CRM; não reimportar um lead bloqueado. Guardar apenas o necessário para prospecção.
- O CRM pode funcionar com importação manual/CSV antes de haver credenciais ativas. Se faltar uma das chaves, informar qual etapa não está disponível, sem simular resultados.

## Modelo de dados inicial

`campaigns` (filtros, ator, configuração, limites), `runs` (status, contadores, erro, custo), `businesses` (identidade, contato, classificação, etapa), `observations` (campo, valor, URL, fonte, data, confiança), `activities` (ligação, WhatsApp, nota, tarefa, data, resultado), `proposals` (produto, plataforma, valor, status), `suppression` (telefone/domínio/identificador bloqueado). A escolha de banco e autenticação deve considerar acesso apenas de operadores autorizados.

## Ordem de entrega

1. Banco, autenticação, importação manual/CSV, deduplicação, lista, detalhe e pipeline.
2. Busca por campanha na Apify, normalização e histórico de execução.
3. Enriquecimento Firecrawl, evidências e classificação revisável.
4. Contato individual, templates editáveis e atividades.
5. Propostas, indicadores e limites operacionais.

## Critérios para aceitar o MVP

- Busca por “estética automotiva” em “São Gonçalo, RJ” gera leads com origem e data; repetir a campanha não apaga o histórico nem duplica negócios identificados.
- Um perfil do Instagram ou Linktree sem domínio próprio é marcado como “apenas rede social/agregador”; um domínio próprio com loja é marcado como “loja virtual encontrada”; um resultado inconclusivo fica “incerto”.
- O detalhe permite inspecionar a URL que justifica cada conclusão e corrigir classificação equivocada.
- Cada lead tem sua própria mensagem editável; clicar no botão abre a conversa somente após revisão do operador. Nenhum envio em massa ocorre.
- Telefone fixo ou número inválido não recebe selo de “WhatsApp verificado”. O CRM nunca promete verificar a existência de conta pelo formato do número.
- Falhas da Apify ou Firecrawl aparecem na execução e não transformam ausência de evidência em certeza de que não há site.

## Site institucional, landing page, Tooplate e Lovable

No detalhe do lead, selecione “Site institucional” como oferta e use **Preparar briefing do site** para gerar um texto editável com os dados conhecidos e campos que precisam ser confirmados com o negócio. Há links para o [gerador de prompt de portfólio](https://www.tooplate.com/tools/ai-portfolio-page-prompt-generator), enviado como referência, e para o [gerador de landing page](https://www.tooplate.com/tools/ai-landing-page-prompt-generator), mais adequado para muitos comércios locais. O Tooplate gera e permite copiar/exportar **prompts**; a criação, aprovação do conteúdo, hospedagem e publicação do site ainda são etapas executadas fora do CRM. Nuvemshop e Yampi permanecem opções de entrega de lojas de e-commerce. O card FlowExtract é uma referência opcional de ator externo e não executa nenhuma consulta paga automaticamente.

O botão **Gerar prompt Lovable** prepara um texto editável para **site institucional** ou **landing page**, usando os dados do lead e marcadores para informações pendentes. Copie o prompt e abra a [Lovable](https://lovable.dev/) para construir o site; revise com a empresa antes de publicar. O CRM não envia dados à Lovable automaticamente nem cria um projeto em seu nome.

## Mensagens por IA para WhatsApp

Crie uma chave gratuita no [console Groq](https://console.groq.com/keys) e salve-a em **Configurações → Groq · mensagens com IA**; o CRM cifra a chave no banco Supabase e realiza as chamadas apenas no servidor. Alternativamente configure `GROQ_API_KEY` no servidor. O modelo é `openai/gpt-oss-20b`; consulte a [cota efetiva da sua organização](https://console.groq.com/settings/limits) antes de planejar o volume diário.

No lead, abra **Preparar WhatsApp**, informe o nome da pessoa somente se confirmado e uma observação verdadeira sobre o Instagram caso tenha analisado o perfil. Caso já tenha criado uma prévia, cole o link HTTPS e confirme que ela existe; só marque imagens reais quando tiver permissão de uso. Clique **Gerar mensagem com IA**, revise o texto editável e abra a conversa no WhatsApp para enviar manualmente. O botão gera um rascunho por clique e não cria sites, pesquisa o Instagram, nem envia mensagens automaticamente. Sem uma prévia real confirmada, a mensagem propõe mostrar uma ideia em vez de alegar que um site já está pronto.

## Exportação de leads

Em **Exportações**, baixe CSV para guardar uma cópia no seu computador. O download não apaga leads: o PostgreSQL do Supabase continua sendo a base ativa. Aproximadamente 3.000 leads com campos textuais e algumas observações por empresa costumam ocupar uma pequena fração do limite gratuito, mas o tamanho real depende dos textos e evidências armazenados. Consulte o uso do projeto no painel Supabase periodicamente.
