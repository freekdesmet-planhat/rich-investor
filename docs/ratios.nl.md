# Ratio-uitleg (Nederlands)

Dit bestand is de enige bron voor de Nederlandse uitleg bij elke ratio, elke
Lynch-categorie en elke voorwaarde van het koopwaardig-signaal. De tooltips in
de app en de tabel `translations` worden hieruit gevuld — niets wordt apart in
componenten hardgecodeerd.

Formaat, per blok:

    ## <namespace>:<sleutel>
    **Naam:** korte titel op de kaart
    **Doel:** het doel, met tussen haakjes of het uit het boek komt

    De uitleg achter de "?"-knop.

---

## ratio:pe
**Naam:** Koers-winstverhouding (K/W)
**Doel:** maximaal 30 (uit het boek)

De bekendste waarderingsmaatstaf, maar op zichzelf onvolledig: hij kijkt naar één
jaar winst en zegt niets over groei. Een lage K/W is nooit op zichzelf een reden
om te kopen — zonder winstgroei is een aandeel feitelijk nooit goedkoop. Beoordeel
de K/W altijd samen met de PEG-ratio en de groeicategorie. Het boek geeft 30 als
plafond, ook voor hardgroeiers: 60 keer de winst betalen voor 60% groei is niet
realistisch. Voor grote technologiebedrijven met hoge uitgaven aan onderzoek en
ontwikkeling loont het om ook naar de voor R&D gecorrigeerde K/W te kijken.

## ratio:peg
**Naam:** PEG-ratio
**Doel:** ≤ 1 bij hoge groei, ≤ 0,7 bij gemiddelde groei, ≤ 0,5 bij lage groei (uit het boek)

De centrale waarderingsmaatstaf van het boek: hij koppelt de prijs aan de groei.
Winstgroei is "een vector met richting, kracht en lengte"; de PEG maakt dat
meetbaar. Het boek wil dat je strenger wordt naarmate de groei lager ligt, vandaar
drie verschillende grenzen. Let op: een PEG van 1 bij 5% groei levert veel minder
op dan een PEG van 1 bij 25% groei — vertrouw nooit op één maatstaf alleen.
Voorwaarde voor hoge groei is dat het bedrijf die groei kan volhouden dankzij een
sterk concurrentievoordeel.

De app toetst de PEG op twee manieren: op basis van de gerealiseerde winstgroei en
op basis van de verwachte groei van analisten. Slaagt alleen de verwachte variant,
dan staat dat er uitdrukkelijk bij — die groei is dan nog niet zichtbaar in de
gerapporteerde cijfers.

## ratio:ev_ebit
**Naam:** Ondernemingswaarde / EBIT
**Doel:** ≤ 20 (standaardinstelling van de app)

Het boek noemt dit een van de drie belangrijkste waarderingsmethodes, en preciezer
dan de K/W omdat de schuld wordt meegerekend: wie een bedrijf koopt, koopt de
schuld erbij. Denk aan een ijsberg — de beurswaarde is het zichtbare deel boven
water, de schuld het onzichtbare deel eronder. EBIT laat de operationele winst zien
los van de financierings- en belastingstructuur. Vergelijk vooral met het eigen
verleden van het bedrijf en met sectorgenoten. Niet van toepassing op banken en
verzekeraars.

## ratio:p_fcf
**Naam:** Koers / vrije kasstroom
**Doel:** ≤ 25 (standaardinstelling van de app)

Voor de rijke belegger belangrijker dan de nettowinst. De vrije kasstroom is wat er
werkelijk overblijft na alle kosten, belastingen en investeringen — dat geeft het
management de vrijheid om aandeelhoudersvriendelijke keuzes te maken (herinvesteren,
schuld aflossen, dividend, inkoop van eigen aandelen) zonder financiële druk. Extra
kwaliteitssignaal: ligt de vrije kasstroom dicht bij de nettowinst, dan wijst dat op
een voorzichtige en transparante boekhouding. Een negatieve vrije kasstroom is rood.

## ratio:earnings_quality
**Naam:** Operationele kasstroom / nettowinst
**Doel:** ≥ 1 (uit het boek)

Rapporteert een bedrijf meer nettowinst dan het aan kasstroom uit de kernactiviteiten
binnenhaalt, vraag je dan af waar dat verschil vandaan komt — vaak zijn het eenmalige
baten, bijvoorbeeld de verkoop van een pand of machines, die geen structureel inkomen
zijn. Een stijgende operationele kasstroom is een duidelijk signaal van echte,
autonome groei. Het boek noemt het uitdrukkelijk een rode vlag wanneer de operationele
kasstroom negatief is terwijl de nettowinst positief is.

## ratio:roe
**Naam:** Rendement op eigen vermogen (ROE)
**Doel:** > 15%, en dat meerdere jaren achtereen (uit het boek)

De favoriete ratio van Warren Buffett; het boek noemt hem "het spaarpercentage van
het bedrijf". Hij laat zien hoeveel winst een bedrijf maakt op elke euro ingelegd
eigen vermogen. Het effect van samengestelde groei werkt alleen als (1) de winst
wordt geherinvesteerd en (2) het bedrijf dat hoge rendement vasthoudt terwijl het
eigen vermogen groeit — en dat lukt alleen met een sterke slotgracht en voldoende
ruimte om te groeien. Eén goed jaar is niet genoeg: de app kijkt of de drempel in
minstens vier van de vijf jaar is gehaald.

## ratio:roa
**Naam:** Rendement op activa (ROA)
**Doel:** > 10%, consistent (uit het boek)

Een variant op de ROE die ook het vreemd vermogen meetelt. Een hoge ROA laat zien
dat het bedrijf al zijn beschikbare middelen effectief inzet, niet alleen het eigen
vermogen. Samen met een hoge ROE noemt het boek dit "een sterk fundament voor
waardecreatie".

Bij betaalbedrijven wordt de ROA gecorrigeerd. Hun balans bevat settlementsaldi —
geld dat onderweg is tussen verkopers, kaartnetwerken en banken — en dat blaast de
activa op zonder iets te zeggen over de operationele prestatie. De ruwe ROA blijft
zichtbaar naast de gecorrigeerde.

## ratio:eps_growth
**Naam:** Groei van de winst per aandeel
**Doel:** ≥ 15% per jaar (uit het boek)

Volgens het boek de uitkomst waar al het andere uiteindelijk toe dient: groei van de
winst per aandeel. Bedrijven met consistente hoge of gemiddelde winstgroei leveren op
lange termijn het beste rendement. Peter Lynch noemt 20 tot 25% het optimale,
vol te houden tempo. Let ook op hoeveel van de groei uit echte winststijging komt en
hoeveel uit de inkoop van eigen aandelen.

De groei wordt gemeten met een kleinste-kwadratenlijn door alle jaren, niet alleen
tussen het eerste en het laatste jaar. Eén uitzonderlijk begin- of eindjaar bepaalt
zo niet in zijn eentje het hele groeicijfer.

## ratio:revenue_growth
**Naam:** Omzetgroei
**Doel:** ≥ 10% per jaar (standaardinstelling van de app)

Het boek noemt omzet "de turbotrigger": moeilijker te manipuleren dan winst, en
zonder omzetgroei loopt de winstgroei uiteindelijk tegen een plafond aan, want
kosten kun je niet eindeloos blijven snijden. Kijk ook naar de samenstelling van de
omzet (eenmalig versus terugkerend, abonnementen) en naar prijs versus volume.

## ratio:gross_margin
**Naam:** Brutomarge
**Doel:** ≥ 50%, of vijf jaar achtereen gestegen (uit het boek)

Marges maken het concurrentievoordeel meetbaar. Hoge, stabiele marges wijzen op
prijszettingsmacht. Het boek zoekt twee soorten bedrijven: bedrijven met een hoge
brutomarge, en bedrijven met een lagere marge die gestaag stijgt. De echte magie
ontstaat wanneer omzetgroei samenvalt met stijgende marges — dan versnelt de
winstgroei.

## ratio:net_margin
**Naam:** Nettomarge
**Doel:** ≥ 20% (uit het boek)

Het boek noemt ongeveer 12% als gemiddelde van de S&P 500 en wil bedrijven die daar
duidelijk boven zitten. De nettomarge laat zien wat er van elke euro omzet
daadwerkelijk als winst overblijft.

## ratio:debt
**Naam:** Nettoschuld / EBITDA
**Doel:** ≤ 1 (standaardinstelling van de app)

Het boek geeft hier geen getallen, maar is ondubbelzinnig: te veel schuld is een
no-gocriterium. De rijke belegger kiest grote, volwassen bedrijven met veel kas,
stabiele inkomsten en weinig schuld. De risico's nemen toe bij hogere rente of
afzwakkende groei, zeker bij kapitaalintensieve bedrijven. Grote, gevestigde
bedrijven hebben doorgaans minder schuld nodig dan jonge, snelgroeiende. Een
nettokaspositie is groen: er is dan meer kas dan schuld.

## ratio:dividend_yield
**Naam:** Dividendrendement
**Doel:** geen koopcriterium; boven 7% een waarschuwing (uit het boek)

Het boek zegt het onomwonden: beleg nooit uitsluitend op basis van het
dividendrendement. De rijke belegger kijkt naar het totaalrendement — koerswinst
plus dividend — waarbij het grootste deel uit koerswinst komt. Dividend werkt wel
als anker bij beweeglijke koersen. Weeg het dividend altijd samen met de
uitkeringsratio, de vrije kasstroom, de dividendhistorie en de dividendgroei.
Amerikaanse bedrijven verlagen hun dividend minder snel dan Europese. Geen dividend
is geen minpunt.

## ratio:payout_ratio
**Naam:** Uitkeringsratio
**Doel:** ≤ 40% voor groeiaandelen (uit het boek)

0% betekent dat alle winst wordt geherinvesteerd — precies wat het effect van
samengestelde groei nodig heeft. 100% betekent dat het eigen vermogen niet meer
groeit. Een hoge uitkeringsratio zet een plafond op het opwaarts potentieel, zoals
je spaarrente elk jaar opnemen. Het boek noemt 90% als signaal dat er weinig
groeiruimte over is en het dividend kwetsbaar wordt, en ongeveer 36% als het
gemiddelde van de S&P 500 in 2024. Een bedrijf met zowel een hoge ROE als een hoge
uitkeringsratio staat vaak op het punt waar verdere groei in eigen huis minder
rendabel is geworden.

## ratio:rnd_adjusted_pe
**Naam:** Voor R&D gecorrigeerde K/W
**Doel:** ≤ 20 (uit het boek)

Grote technologiebedrijven boeken enorme bedragen aan onderzoek en ontwikkeling
direct als kosten, terwijl een groot deel daarvan investering in de toekomst is
("moonshots"). Tel je die weer bij de winst op, dan wordt verborgen winstgevendheid
zichtbaar — het boek laat zien hoe de K/W van Meta van 27 naar ongeveer 10,8 gaat na
correctie voor R&D. Alleen zinvol bij bedrijven met hoge R&D-uitgaven en sterke
omzetgroei, en wees voorzichtig: niet alle R&D is verborgen winst. Het boek noemt
drie voordelen: je kunt verantwoord instappen bij een op het oog hoge K/W,
R&D-uitgaven hangen sterk samen met de koers op lange termijn, en snijdt het bedrijf
in R&D, dan springt de gerapporteerde winst omhoog.

## ratio:p_s
**Naam:** Koers / omzet
**Doel:** informatief, geen kleurcode

Vooral nuttig bij snelgroeiende bedrijven die nog geen winst maken. Waarschuwing uit
het boek: in 2008 werd pijnlijk duidelijk dat omzet geen winst is — bedrijven die op
deze ratio goedkoop leken, werden het hardst geraakt in de crash.

## ratio:p_b
**Naam:** Koers / boekwaarde
**Doel:** informatief; vooral relevant voor banken en verzekeraars

Heeft veel van zijn populariteit verloren en zegt weinig over technologie- en
platformbedrijven, die waarde creëren via netwerkeffecten. Let op "waardevallen":
aandelen die alleen op boekwaarde goedkoop lijken.

## ratio:inventory_receivables
**Naam:** Voorraden en debiteuren versus omzet
**Doel:** groeien niet sneller dan de omzet (uit het boek)

Oplopende voorraden betekenen dat producten minder goed verkopen dan gepland;
oplopende debiteuren dat klanten later betalen. Beide kunnen leiden tot
afwaarderingen en winstwaarschuwingen, zeker in sectoren waar de ontwikkelingen snel
gaan. Bedrijven zonder voorraden — software, betaalnetwerken — noemt het boek het
ideale bedrijfsmodel; daar is deze toets niet van toepassing.

Bij betaalbedrijven is deze kaart grijs: hun debiteuren zijn settlementsaldi die
meebewegen met het transactievolume, en zeggen niets over het risico dat een klant
niet betaalt.

## ratio:drawdown_5y
**Naam:** Daling vanaf de top van vijf jaar
**Doel:** ≥ 50% onder de hoogste slotkoers van vijf jaar (uit het boek)

"De logaritmische waterval": een daling van 20% vraagt 25% herstel, een daling van
70% vraagt 233%. Hoe dieper een kwaliteitsaandeel valt, hoe groter het statistische
voordeel. De rijke belegger let vooral op dalingen van 50 tot 70% bij
kwaliteitsbedrijven, omdat die zeldzaam zijn zonder structureel probleem. De
cruciale vraag die de app níét kan beantwoorden en aan jou voorlegt: is het probleem
tijdelijk of structureel? Een koersdaling alleen is nooit een reden om te kopen.

## ratio:market_cap
**Naam:** Beurswaarde
**Doel:** ≥ 10 miljard dollar (uit het boek)

Volgens het boek hebben sectorleiders meer herstelpotentieel: ze herstellen sneller,
met meer zekerheid, en blijven daarna doorgroeien. Greenwald: de afstand tot nummer
twee telt net zo zwaar als het marktaandeel zelf. Kleine bedrijven zijn vaker
goedkoop, maar blijven ook langer goedkoop.

---

## lynch:high_growth
**Naam:** Hoge winstgroei
**Doel:** winst per aandeel groeit met 20% of meer per jaar

De categorie waar het boek zich op richt. Deze bedrijven kunnen een koopsignaal
krijgen. Voorwaarde is wel dat de groei vol te houden is dankzij een sterk
concurrentievoordeel.

## lynch:average_growth
**Naam:** Gemiddelde winstgroei
**Doel:** winst per aandeel groeit met 10 tot 20% per jaar

Ook deze categorie kan een koopsignaal krijgen, maar de PEG-grens is strenger: 0,7
in plaats van 1.

## lynch:low_growth
**Naam:** Lage winstgroei
**Doel:** winst per aandeel groeit met minder dan 10% per jaar

Alleen met een uitdrukkelijke waarschuwing. De PEG-grens is hier 0,5.

## lynch:cyclical
**Naam:** Cyclisch
**Doel:** buiten de focus van het boek

De winst beweegt sterk mee met de economische cyclus. Het boek denkt hierbij aan
auto's, bouw, grondstoffen en industrie. Halfgeleiders vallen hier uitdrukkelijk
niet onder: hun winst is beweeglijk, maar het boek noemt microchips juist de
best presterende subsector die het behandelt.

## lynch:turnaround
**Naam:** Turnaround
**Doel:** buiten de focus, hoog risico

Het bedrijf maakt verlies of ziet de winst meerdere jaren achtereen dalen. Zo'n
herstelverhaal kan uitzonderlijk goed uitpakken, maar het boek rekent het
uitdrukkelijk tot de categorie met hoog risico en houdt het buiten de focus: de
uitkomst hangt af van een ommekeer die nog moet worden bewezen, niet van een
bewezen vermogen om winst te laten groeien. Deze categorie krijgt geen
koopsignaal.

## lynch:financial_institution
**Naam:** Financiële instelling
**Doel:** buiten de focus

Banken en verzekeraars. Hun balans betekent iets anders dan die van een operationeel
bedrijf, dus ratio's als EV/EBIT en koers/vrije kasstroom zijn hier grijs en wordt in
plaats daarvan naar de koers/boekwaarde gekeken.

## lynch:unknown
**Naam:** Niet te classificeren
**Doel:** uitgesloten van koopsignalen

Er is te weinig samenhangende winsthistorie om de groei te meten. Het boek
waarschuwt ervoor een gebrek aan informatie op te vullen met een aanname, dus de app
forceert hier geen categorie.

## lynch:basis_eps_partial
**Naam:** Gemeten over een deel van de periode
**Doel:** —

De winsthistorie vertoont een gat, dus de groei is gemeten over de langste
aaneengesloten reeks binnen het venster van vijf jaar.

## lynch:basis_revenue
**Naam:** Ingedeeld op omzetgroei
**Doel:** —

De winsthistorie is onvolledig, dus de indeling is gebaseerd op omzetgroei. Dit
geldt alleen voor de categorie-indeling — niet voor de PEG en niet voor het
koopsignaal.

## lynch:tolerance_applied
**Naam:** Net binnen de bandbreedte
**Doel:** —

De groei bleef net onder de grens van deze categorie en is binnen de marge van
één procentpunt naar boven afgerond. De percentages van Lynch komen uit een
kwalitatieve methode; een verschil van een tiende procentpunt hoort niet te
bepalen welke PEG-grens geldt.
