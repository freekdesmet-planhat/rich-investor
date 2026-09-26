# Ratio-uitleg (Nederlands)

Dit bestand is de enige bron voor de Nederlandse uitleg bij elke ratio, elke
Lynch-categorie en elke voorwaarde van het koopwaardig-signaal. De tooltips in
de app en de tabel `translations` worden hieruit gevuld — niets wordt apart in
componenten hardgecodeerd.

Formaat, per blok:

    ## <namespace>:<sleutel>
    **Naam:** korte titel op de kaart
    **Doel:** het doel, en waar het vandaan komt

    De uitleg achter de "?"-knop.

---

## ratio:pe
**Naam:** Koers-winstverhouding (K/W)
**Doel:** maximaal 30

De bekendste waarderingsmaatstaf, maar op zichzelf onvolledig: hij kijkt naar één
jaar winst en zegt niets over groei. Een lage K/W is nooit op zichzelf een reden
om te kopen — zonder winstgroei is een aandeel feitelijk nooit goedkoop. Beoordeel
de K/W altijd samen met de PEG-ratio en de groeicategorie. Deze methode hanteert 30 als
plafond, ook voor hardgroeiers: 60 keer de winst betalen voor 60% groei is niet
realistisch. Voor grote technologiebedrijven met hoge uitgaven aan onderzoek en
ontwikkeling loont het om ook naar de voor R&D gecorrigeerde K/W te kijken.

## ratio:peg
**Naam:** PEG-ratio
**Doel:** ≤ 1 bij hoge groei, ≤ 0,7 bij gemiddelde groei, ≤ 0,5 bij lage groei

De centrale waarderingsmaatstaf van deze methode: hij koppelt de prijs aan de groei.
Winstgroei is "een vector met richting, kracht en lengte"; de PEG maakt dat
meetbaar. Naarmate de groei lager ligt wordt de eis strenger, vandaar
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

Dit is een van de drie belangrijkste waarderingsmethodes, en preciezer
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
**Doel:** ≥ 1

Rapporteert een bedrijf meer nettowinst dan het aan kasstroom uit de kernactiviteiten
binnenhaalt, vraag je dan af waar dat verschil vandaan komt — vaak zijn het eenmalige
baten, bijvoorbeeld de verkoop van een pand of machines, die geen structureel inkomen
zijn. Een stijgende operationele kasstroom is een duidelijk signaal van echte,
autonome groei. Het is uitdrukkelijk een rode vlag wanneer de operationele
kasstroom negatief is terwijl de nettowinst positief is.

## ratio:roe
**Naam:** Rendement op eigen vermogen (ROE)
**Doel:** > 15%, en dat meerdere jaren achtereen

De favoriete ratio van Warren Buffett, en te omschrijven als het spaarpercentage van
het bedrijf. Hij laat zien hoeveel winst een bedrijf maakt op elke euro ingelegd
eigen vermogen. Het effect van samengestelde groei werkt alleen als (1) de winst
wordt geherinvesteerd en (2) het bedrijf dat hoge rendement vasthoudt terwijl het
eigen vermogen groeit — en dat lukt alleen met een sterke slotgracht en voldoende
ruimte om te groeien. Eén goed jaar is niet genoeg: de app kijkt of de drempel in
minstens vier van de vijf jaar is gehaald.

## ratio:roa
**Naam:** Rendement op activa (ROA)
**Doel:** > 10%, consistent

Een variant op de ROE die ook het vreemd vermogen meetelt. Een hoge ROA laat zien
dat het bedrijf al zijn beschikbare middelen effectief inzet, niet alleen het eigen
vermogen. Samen met een hoge ROE is dat een sterk fundament voor
waardecreatie".

Bij betaalbedrijven wordt de ROA gecorrigeerd. Hun balans bevat settlementsaldi —
geld dat onderweg is tussen verkopers, kaartnetwerken en banken — en dat blaast de
activa op zonder iets te zeggen over de operationele prestatie. De ruwe ROA blijft
zichtbaar naast de gecorrigeerde.

## ratio:eps_growth
**Naam:** Groei van de winst per aandeel
**Doel:** ≥ 15% per jaar

De uitkomst waar al het andere uiteindelijk toe dient: groei van de
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

Omzet is de turbotrigger: moeilijker te manipuleren dan winst, en
zonder omzetgroei loopt de winstgroei uiteindelijk tegen een plafond aan, want
kosten kun je niet eindeloos blijven snijden. Kijk ook naar de samenstelling van de
omzet (eenmalig versus terugkerend, abonnementen) en naar prijs versus volume.

## ratio:gross_margin
**Naam:** Brutomarge
**Doel:** ≥ 50%, of vijf jaar achtereen gestegen

Marges maken het concurrentievoordeel meetbaar. Hoge, stabiele marges wijzen op
prijszettingsmacht. Deze methode zoekt twee soorten bedrijven: bedrijven met een hoge
brutomarge, en bedrijven met een lagere marge die gestaag stijgt. De echte magie
ontstaat wanneer omzetgroei samenvalt met stijgende marges — dan versnelt de
winstgroei.

## ratio:net_margin
**Naam:** Nettomarge
**Doel:** ≥ 20%

Ongeveer 12% is het gemiddelde van de S&P 500, en gezocht worden bedrijven die daar
duidelijk boven zitten. De nettomarge laat zien wat er van elke euro omzet
daadwerkelijk als winst overblijft.

## ratio:debt
**Naam:** Nettoschuld / EBITDA
**Doel:** ≤ 1 (standaardinstelling van de app)

Hier zijn geen vaste getallen, maar het uitgangspunt is ondubbelzinnig: te veel schuld is een
no-gocriterium. De rijke belegger kiest grote, volwassen bedrijven met veel kas,
stabiele inkomsten en weinig schuld. De risico's nemen toe bij hogere rente of
afzwakkende groei, zeker bij kapitaalintensieve bedrijven. Grote, gevestigde
bedrijven hebben doorgaans minder schuld nodig dan jonge, snelgroeiende. Een
nettokaspositie is groen: er is dan meer kas dan schuld.

## ratio:dividend_yield
**Naam:** Dividendrendement
**Doel:** geen koopcriterium; boven 7% een waarschuwing

Onomwonden gezegd: beleg nooit uitsluitend op basis van het
dividendrendement. De rijke belegger kijkt naar het totaalrendement — koerswinst
plus dividend — waarbij het grootste deel uit koerswinst komt. Dividend werkt wel
als anker bij beweeglijke koersen. Weeg het dividend altijd samen met de
uitkeringsratio, de vrije kasstroom, de dividendhistorie en de dividendgroei.
Amerikaanse bedrijven verlagen hun dividend minder snel dan Europese. Geen dividend
is geen minpunt.

## ratio:payout_ratio
**Naam:** Uitkeringsratio
**Doel:** ≤ 40% voor groeiaandelen

0% betekent dat alle winst wordt geherinvesteerd — precies wat het effect van
samengestelde groei nodig heeft. 100% betekent dat het eigen vermogen niet meer
groeit. Een hoge uitkeringsratio zet een plafond op het opwaarts potentieel, zoals
je spaarrente elk jaar opnemen. 90% is het signaal dat er weinig
groeiruimte over is en het dividend kwetsbaar wordt, en ongeveer 36% als het
gemiddelde van de S&P 500 in 2024. Een bedrijf met zowel een hoge ROE als een hoge
uitkeringsratio staat vaak op het punt waar verdere groei in eigen huis minder
rendabel is geworden.

## ratio:rnd_adjusted_pe
**Naam:** Voor R&D gecorrigeerde K/W
**Doel:** ≤ 20

Grote technologiebedrijven boeken enorme bedragen aan onderzoek en ontwikkeling
direct als kosten, terwijl een groot deel daarvan investering in de toekomst is
("moonshots"). Tel je die weer bij de winst op, dan wordt verborgen winstgevendheid
zichtbaar — de K/W van Meta gaat bijvoorbeeld van 27 naar ongeveer 10,8 na
correctie voor R&D. Alleen zinvol bij bedrijven met hoge R&D-uitgaven en sterke
omzetgroei, en wees voorzichtig: niet alle R&D is verborgen winst. Er zijn
drie voordelen: je kunt verantwoord instappen bij een op het oog hoge K/W,
R&D-uitgaven hangen sterk samen met de koers op lange termijn, en snijdt het bedrijf
in R&D, dan springt de gerapporteerde winst omhoog.

## ratio:p_s
**Naam:** Koers / omzet
**Doel:** informatief, geen kleurcode

Vooral nuttig bij snelgroeiende bedrijven die nog geen winst maken. Waarschuwing uit
de praktijk: in 2008 werd pijnlijk duidelijk dat omzet geen winst is — bedrijven die op
deze ratio goedkoop leken, werden het hardst geraakt in de crash.

## ratio:p_b
**Naam:** Koers / boekwaarde
**Doel:** informatief; vooral relevant voor banken en verzekeraars

Heeft veel van zijn populariteit verloren en zegt weinig over technologie- en
platformbedrijven, die waarde creëren via netwerkeffecten. Let op "waardevallen":
aandelen die alleen op boekwaarde goedkoop lijken.

## ratio:inventory_receivables
**Naam:** Voorraden en debiteuren versus omzet
**Doel:** groeien niet sneller dan de omzet

Oplopende voorraden betekenen dat producten minder goed verkopen dan gepland;
oplopende debiteuren dat klanten later betalen. Beide kunnen leiden tot
afwaarderingen en winstwaarschuwingen, zeker in sectoren waar de ontwikkelingen snel
gaan. Bedrijven zonder voorraden — software, betaalnetwerken — zijn het
ideale bedrijfsmodel; daar is deze toets niet van toepassing.

Bij betaalbedrijven is deze kaart grijs: hun debiteuren zijn settlementsaldi die
meebewegen met het transactievolume, en zeggen niets over het risico dat een klant
niet betaalt.

## ratio:drawdown_5y
**Naam:** Daling vanaf de top van vijf jaar
**Doel:** ≥ 50% onder de hoogste slotkoers van vijf jaar

"De logaritmische waterval": een daling van 20% vraagt 25% herstel, een daling van
70% vraagt 233%. Hoe dieper een kwaliteitsaandeel valt, hoe groter het statistische
voordeel. De rijke belegger let vooral op dalingen van 50 tot 70% bij
kwaliteitsbedrijven, omdat die zeldzaam zijn zonder structureel probleem. De
cruciale vraag die de app níét kan beantwoorden en aan jou voorlegt: is het probleem
tijdelijk of structureel? Een koersdaling alleen is nooit een reden om te kopen.

## ratio:market_cap
**Naam:** Beurswaarde
**Doel:** ≥ 10 miljard dollar

Sectorleiders hebben meer herstelpotentieel: ze herstellen sneller,
met meer zekerheid, en blijven daarna doorgroeien. Greenwald: de afstand tot nummer
twee telt net zo zwaar als het marktaandeel zelf. Kleine bedrijven zijn vaker
goedkoop, maar blijven ook langer goedkoop.

---

## lynch:high_growth
**Naam:** Hoge winstgroei
**Doel:** winst per aandeel groeit met 20% of meer per jaar

De categorie waar dit raamwerk zich op richt. Deze bedrijven kunnen een koopsignaal
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
**Doel:** buiten de vier focussectoren

De winst beweegt sterk mee met de economische cyclus. Denk hierbij aan
auto's, bouw, grondstoffen en industrie. Halfgeleiders vallen hier uitdrukkelijk
niet onder: hun winst is beweeglijk, maar microchips zijn juist de
best presterende subsector die het behandelt.

## lynch:turnaround
**Naam:** Turnaround
**Doel:** buiten de focus, hoog risico

Het bedrijf maakt verlies of ziet de winst meerdere jaren achtereen dalen. Zo'n
herstelverhaal kan uitzonderlijk goed uitpakken, maar het hoort
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

Er is te weinig samenhangende winsthistorie om de groei te meten. Let op:
hier geldt ervoor een gebrek aan informatie op te vullen met een aanname, dus de app
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

---

## condition:focus_sector
**Naam:** Focussector
**Doel:** valt binnen een van de vier focussectoren

Deze methode beperkt zich tot vier sectoren: informatietechnologie, luxegoederen en
consumentengoederen, entertainment en interactieve media, en niet-bancaire
financiële dienstverlening. Aandelen daarbuiten mag je zelf toevoegen, maar ze
krijgen een oranje label en geen koopsignaal.

## condition:lynch_category
**Naam:** Groeicategorie
**Doel:** hoge of gemiddelde winstgroei

Alleen bedrijven met hoge of gemiddelde winstgroei komen in aanmerking voor een
koopsignaal. Cyclische bedrijven, turnarounds en financiële instellingen vallen
buiten de focus; bedrijven met lage groei alleen met een
uitdrukkelijke waarschuwing.

## condition:market_cap
**Naam:** Beurswaarde
**Doel:** ten minste 10 miljard dollar

De rijke belegger kiest grote, gevestigde bedrijven. Die herstellen sneller en
met meer zekerheid na een diepe daling, en blijven daarna doorgroeien.

## condition:drawdown
**Naam:** Daling vanaf de top van vijf jaar
**Doel:** ten minste 50% onder de hoogste slotkoers van vijf jaar

Het kernsignaal van deze methode. Dalingen van 50 tot 70% bij kwaliteitsbedrijven
zijn zeldzaam zonder structureel probleem, en juist daar ligt het statistische
voordeel. Instelbaar, met een ondergrens van 35%.

## condition:peg
**Naam:** PEG-ratio
**Doel:** onder de grens van de groeicategorie, gerealiseerd óf verwacht

De voorwaarde slaagt als de PEG op basis van de gerealiseerde winstgroei óf op
basis van de verwachte groei onder de grens blijft. Welke van de twee het deed,
staat bij het signaal vermeld — slaagt alleen de verwachte variant, dan rust het
oordeel op een verwachting die nog niet in de cijfers zichtbaar is.

## condition:pe
**Naam:** Koers-winstverhouding
**Doel:** ≤ 30, of ≤ 20 na correctie voor R&D

Het plafond van 30 geldt ook voor hardgroeiers. Voor technologiebedrijven met
hoge R&D-uitgaven telt de gecorrigeerde variant mee als alternatief.

## condition:returns
**Naam:** Rendement op eigen vermogen en activa
**Doel:** ROE > 15% en ROA > 10%, meerdere jaren achtereen

Beide moeten consistent gehaald worden, niet alleen in het laatste jaar. Bij
betaalbedrijven wordt de ROA gecorrigeerd voor settlementsaldi.

## condition:cash_flow
**Naam:** Kwaliteit van de kasstroom
**Doel:** vrije kasstroom positief en operationele kasstroom ≥ 70% van de nettowinst

Winst die niet in kas binnenkomt is geen winst waar je op kunt bouwen. Bij banken
en verzekeraars is deze voorwaarde niet van toepassing en telt hij niet mee in de
noemer.

## condition:debt
**Naam:** Schuldniveau
**Doel:** nettoschuld/EBITDA ≤ 2,5 (standaardinstelling van de app)

Te veel schuld is hier een no-gocriterium. Bij banken en verzekeraars is
deze voorwaarde niet van toepassing.

---

## catalyst:management_reaffirms_targets
**Naam:** Management herbevestigt de langetermijndoelen
**Doel:** —

Het management houdt vast aan de eerder afgegeven doelen. Dat is een van de
sterkste aanwijzingen dat een terugval als tijdelijk wordt gezien door de mensen
met de meeste informatie.

## catalyst:management_buying_shares
**Naam:** Management koopt zelf aandelen
**Doel:** —

Bestuurders die met eigen geld bijkopen, zetten hun overtuiging achter hun woorden.

## catalyst:buybacks
**Naam:** Inkoop van eigen aandelen
**Doel:** —

Het bedrijf koopt eigen aandelen in, wat de winst per aandeel verhoogt en laat
zien dat het management de koers laag vindt.

## catalyst:dividend_increase
**Naam:** Dividendverhoging
**Doel:** —

Een verhoging tijdens een koersdaling is een signaal van vertrouwen in de kasstroom.

## catalyst:sector_still_growing
**Naam:** De sector groeit nog
**Doel:** —

Het probleem zit bij dit bedrijf, niet bij de markt waarin het opereert.

## catalyst:founder_or_long_tenured_ceo
**Naam:** Oprichter of langzittende CEO nog aan het roer
**Doel:** —

Continuïteit aan de top, met een eigenaarsblik op de lange termijn.

## catalyst:problem_confined_to_one_cycle
**Naam:** Het probleem beperkt zich tot één cyclus
**Doel:** —

Vraag óf aanbod, niet allebei tegelijk. Dat is het verschil tussen
een tijdelijke dip en een structureel probleem.

## sell_signal:deteriorating_performance
**Naam:** Structureel verslechterende prestaties
**Doel:** —

Niet één zwak kwartaal, maar een lijn die de verkeerde kant op blijft gaan.

## sell_signal:large_acquisition_high_premium
**Naam:** Grote overname tegen een hoge premie
**Doel:** —

Wees wantrouwig richting bedrijven die groei kopen in plaats van verdienen.

## sell_signal:involuntary_cfo_departure
**Naam:** Onvrijwillig vertrek van de CFO
**Doel:** —

Een financieel directeur die niet uit eigen beweging vertrekt, is zelden goed nieuws.

## sell_signal:declining_solvency
**Naam:** Sterk dalende solvabiliteit
**Doel:** —

De schuldpositie verslechtert in een tempo dat de speelruimte wegneemt.

## sell_signal:unusual_insider_selling
**Naam:** Ongebruikelijk veel verkopen door insiders
**Doel:** —

Bestuurders die tegelijk en in omvang verkopen, weten doorgaans iets.

## sell_signal:no_visible_future_growth
**Naam:** Ik zie niet meer waar toekomstige winstgroei vandaan moet komen
**Doel:** —

Dit staat bewust in de eerste persoon: als jíj het verhaal niet meer kunt
navertellen, is dat op zichzelf een reden om te verkopen.
