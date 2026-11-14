# Auditoria do Catálogo e Mídias de Exercícios

**Status:** diagnóstico sem mudança de dados ou código.  
**Regra:** manter MongoDB Atlas; não eliminar, reescrever ou normalizar dados de exercício sem autorização e plano de backup.

## 1. Escopo, snapshot e conclusão executiva

O schema simples observado no checkout aberto (`lib/models.js`) não representa toda a história nem toda a capacidade de mídia do produto. O histórico e a `main` remota mostram pelo menos quatro fontes/caminhos: documentos de exercício no MongoDB; catálogo público wger consultado no servidor; vídeos MP4/posters licenciados wger referenciados por uma tabela estática de correspondência; e um dataset externo Flow Exercise Dataset com metadados JSON e quadros SVG servidos por jsDelivr/Raw GitHub.

A árvore virtual aberta não contém `components/ExerciseAnimation.jsx`, `app/api/exercises/demos/route.js` ou `lib/exercise-animation-matching.mjs`, enquanto esses arquivos existem na `main` remota e no histórico. Também há diferença na quantidade de seeds: o snapshot aberto inicializa 12 exercícios base; histórico remoto inclui um commit de mais de 100 variações e um seed grande com metadados avançados. Logo, “zero vídeos/mídias” não é uma conclusão válida para o produto/histórico. O total atual em produção não pode ser contado sem consulta read-only autorizada ao Mongo, indisponível nesta auditoria.

## 2. Fontes encontradas

| Fonte | Tipo de mídia/dado | Uso conhecido | Persistência |
| --- | --- | --- | --- |
| MongoDB Atlas, collection `exercises` | Nome, equipamento, grupo, instruções e campos opcionais de mídia | Biblioteca usada por fichas e UI | Persistente em documento; volume real não foi consultado |
| wger API v2 (`https://wger.de/api/v2`) | Busca de exercícios, traduções, categoria, músculos, equipamento, imagens e vídeos | Busca/importação assistida pelo editor de exercícios na implementação remota | Metadados selecionados podem ser salvos no documento local; mídia permanece hospedada pelo wger |
| wger media CDN (`https://wger.de/media/...`) | MP4 e imagens/posters | Demonstração exata por nome+equipamento e exercício importado | URL externa; arquivo não copiado para Mongo |
| Flow Exercise Dataset (`ozansozuozgit/flow-exercise-dataset`) | JSON com exercícios, animação, sequência de frames e SVGs | Animação demonstrativa ilustrativa por matching semântico conservador | Dataset externo; frames externos, cache/lazy load no cliente |
| GitHub Raw (`raw.githubusercontent.com`) | Frames `.svg` | Resolve paths relativos do dataset e evita o endpoint CDN para SVG | Referência externa; não há cópia no diretório `public` observado |
| jsDelivr (`cdn.jsdelivr.net`) | `data/exercises.json` | Carregamento do catálogo JSON de animações | Recurso runtime externo; dependente da CDN |

Não foi encontrado diretório `public/` na árvore remota consultada; o fetch da URL de árvore `main/public` retornou 404. Na árvore aberta também não apareceu diretório público. Isso não exclui arquivos em outra revisão ou assets introduzidos depois.

## 3. Modelo de exercício e metadados

### Checkout virtual aberto

`lib/models.js` declara collection `exercises`, índice único em `nameKey` e índice por `muscleGroup`, com seed de 12 exercícios (supino reto, supino inclinado, crucifixo, desenvolvimento, elevação lateral, rosca direta, tríceps pulley, agachamento livre, leg press, cadeira extensora, mesa flexora e panturrilha). Campos do seed: `id`, `name`, `nameKey`, `muscleGroup`, `equipment`, `description`, `instructions`, `active`, `createdAt`, `updatedAt`.

A rota aberta `app/api/exercises/route.js` não declara um schema rígido. Ela aceita `equipment`, `description`, `instructions`, e campos conhecidos do snapshot. Não infira que a collection real contém somente os campos do seed.

### `main` remota/histórico

A rota remota de exercícios contém suporte a `gifUrl`, `imageUrl`, `videoUrl`, `mediaAttribution`, `mediaSourceUrl`, `primaryMuscles`, `secondaryMuscles`, `difficulty`, `executionTips` e `contraindications`, além dos campos básicos. A rota de demonstrações seleciona tradução, músculos/equipamento, instruções limpas, imagem, vídeo e referência de licença/fonte. O editor importa esses dados para revisar antes de salvar.

Os nomes de campo/casing variam entre legado, importador e modelo. Durante o redesenho, não renomear, eliminar ou regravar `videoUrl`, `gifUrl`, `imageUrl`, atribuição ou IDs; fazer leitura tolerante e preservar o documento completo ao editar metadados parciais.

## 4. Player e matching encontrados na `main`

### Vídeos mapeados

`lib/exercise-animation-matching.mjs` possui `VIDEO_DEMOS` com duas entradas confirmadas pelo diff do commit `3163bdc`:

1. `supino reto` + equipamento normalizado `barra`; MP4 wger `/exercise-video/73/...MP4`, poster wger `/exercise-images/192/Bench-press-1.png`, fonte `https://wger.de/api/v2/video/23/`; atribuição do vídeo Goulart, CC BY-SA 4.0, poster Everkinetic, CC BY-SA 3.0.
2. Correspondência de tríceps testa/pressão fechada com equipamento `barra ez`; MP4 wger `/exercise-video/246/...MP4`, poster `/exercise-images/84/Lying-close-grip-triceps-press-to-chin-1.png`, fonte `https://wger.de/api/v2/video/61/`; atribuições e licenças explícitas no mapa.

`findExerciseVideo` requer nome normalizado com correspondência exata no mapa e equipamento normalizado exatamente igual. Isso é intencional para evitar demonstração errada; não afrouxar a regra para “parecido” sem teste e validação humana.

### Animações

`ExerciseAnimation.jsx` carrega `data/exercises.json` em `https://cdn.jsdelivr.net/gh/ozansozuozgit/flow-exercise-dataset@main/data/exercises.json`. O loader mantém `datasetPromise` para compartilhar/cachear a requisição. `findAnimation` usa aliases PT/EN e dados de equipamento, requer `animation.sequence` utilizável; não escolhe simplesmente qualquer primeiro resultado. Cada caminho de frame resolve para Raw GitHub quando o path é relativo. Sequência é animada por timer, exceto quando `prefers-reduced-motion` está ativo e quando o documento está oculto.

### Player de vídeo e estados

- `<video controls playsInline preload="metadata">`; não existe autoplay.
- Poster associado ao vídeo e player em proporção 16:9 na folha `app/workout-plans.css` remota.
- Erro do vídeo permite cair no matching de animação.
- Estados de loading, erro de catálogo, não encontrado e falha de asset existem na implementação remota.
- Imagens de frame usam `loading="lazy"`; os frames necessários da sequência são preloaded sob demanda.
- Atribuição e licença aparecem no componente de vídeo e na animação.
- Não foi verificado formato/codec real do conteúdo hospedado, range request, duração, idioma/som, disponibilidade atual ou reprodução em dispositivos; confirmar por smoke test de URL/elemento video e autorização de mídia antes de afirmar compatibilidade.

Campo `gifUrl` aparece na API/editor remotos, mas o componente de mídia inspecionado tem caminhos explícitos para vídeo MP4 e animação SVG, não um renderer GIF confirmado. Tratar GIF como metadado persistido sem prometer reprodução até verificar a versão alvo.

## 5. Rota wger e importação

Na `main`, `app/api/exercises/demos/route.js` é GET e exige `requireStaff()`:

- `?term=` exige pelo menos 2 caracteres; consulta `/exercise/search/`, limita a 10 resultados e envia o termo via `encodeURIComponent`.
- `?id=` exige ID numérico até 8 dígitos; consulta `/exerciseinfo/{id}/` e retorna campos selecionados.
- Timeout é 9 segundos; `cache: 'no-store'`; resposta externa não OK vira erro 502.
- Texto HTML da descrição é reduzido a texto; URLs aceitam apenas protocolos HTTP(S), mas não há evidência no trecho de allowlist de host para cada asset.
- A importação preenche dados do editor e preserva URL, atribuição e origem; o staff revisa e salva.

Os assets ficam fora do app e podem desaparecer, mudar, rate-limit ou alterar conteúdo. O import não deve ser interpretado como transferência de direitos. Não baixar/republicar mídia sem licença, atribuição e autorização verificadas.

## 6. Política de segurança/CSP e disponibilidade

O `next.config.js` do checkout aberto usa CSP `connect-src 'self'`, sem `media-src` ou `img-src` externos explícitos. Já o diff remoto de `3163bdc` adiciona `media-src 'self' https://wger.de` e a história `0b8914f`/`97d9e9f` registra ajustes para carregar animação e frames sob CSP/Raw GitHub. Portanto, política real depende do SHA implantado. Não alterar configuração na fase de UI sem pedido separado; validar a versão escolhida e propor mudança isolada se necessária.

Riscos operacionais: dependência de rede/terceiros; não há fallback offline garantido; URL externa pode falhar; respostas remotas podem mudar; mídia pode aumentar consumo de dados; matching incorreto tem risco de orientação de exercício errada; licença exige crédito persistente e próximo da mídia.

## 7. Histórico Git útil

- `a2b3fa8` e `644df43`: inclusão de demonstrações/player e animações nativas.
- `b812065`, `19ab71e`, `d09ade4`, `49d75b7`, `c73f57a`, `d010cf3`: busca/importação pública, retenção de fonte e atribuição.
- `26e9719`: mais de 100 variações de movimento no catálogo/seed.
- `eeb52fc`, `ac186cf`, `984525b`, `4094ea2`: paginação, estados vazios e correções de catálogo.
- `0b8914f`, `fcd20c6`, `97d9e9f`, `2041188`, `9d4e402`: CSP, matching, correção de frames e preferência por demonstrações verificadas.
- `3163bdc`: vídeos wger com licença, poster e atribuição; adiciona testes de correspondência exata.
- `ee5c3f5`: filtro “Com demonstração” passa a considerar vídeos.

Os títulos/diffs confirmam intenção e áreas, não provam que todo commit está presente no checkout local nem que o asset continua disponível hoje.

## 8. Inventário de produção e preservação obrigatórios antes do redesign

Executar em ambiente autorizado, read-only, sem imprimir documentos pessoais:

1. Registrar branch/SHA e identificar as URIs Mongo configuradas sem revelar segredo.
2. Contar `exercises` total/ativo/inativo e documentos com cada campo de mídia (`gifUrl`, `imageUrl`, `videoUrl`, atribuição/fonte); contar URLs por hostname/extensão.
3. Exportar backup lógico restrito/criptografado antes de alterações no catálogo, com IDs originais e referências de fichas; guardar fora do repositório.
4. Confirmar quantos exercícios citados por `workouts.exercises.exerciseId` existem, quais estão inativos/ausentes e duplicidades por `nameKey`; não consolidar duplicados automaticamente.
5. Amostrar respostas/head requests controlados de mídia externa, status/content-type/codec e licença; evitar baixar arquivos grandes.
6. Executar regressão de renderer/player em cada media type existente e gravar falhas com origem, sem substituir URL por uma inventada.
7. Só depois redesenhar `ExerciseMedia`; usar poster, lazy loading, botão/controles acessíveis, fallback e atribuição persistente.

**Não executado nesta auditoria:** acesso ao banco de produção, export de catálogo, requests aos hosts de mídia ou verificação de licença/codec em tempo real. O checkout sem arquivos de mídia e a busca local vazia não devem ser usados como evidência de ausência em produção.
