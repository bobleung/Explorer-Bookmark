Tehnička specifikacija za diplomski rad „Explorer Bookmark“ 

 

​​Sadržaj 

​ 

​ 

​ 

​ 

​ 

​ 

​ 

​ 

​ 

​ 

​ 

​ 

​ 

​ 

​ 

​ 

​ 

​ 

​​ 

 

1. Pregled projekta 

1.1. Sažetak 

Ova specifikacija predlaže razvoj "Explorer Bookmark" ekstenzije za Visual Studio Code koja optimizuje upravljanje fajlovima i folderima kroz inteligentno označavanje, integraciju sa Git alatkom, funkcionalnosti za saradnju u timovima i integraciju čestih zahteva za AI servise. Ekstenzija je zasnovana na unapređenju timskog i ličnog radnog iskustva na velikim projektima kako u industriji tako i u akademskom okruženju. 

1.2 Formulacija problema 

Moderni razvoj softvera uključuje upravljanje složenim strukturama projekata sa razgranatom mrežom direktorijuma. Programeri često imaju problema sa: 

Neefikasnom navigacijom između često korišćenih fajlova 

Pristupačnošću alatki za timski razvoj proizvoda 

Nedostatkom kontekstualnih informacija o komponentama koda 

1.3 Predloženo rešenje 

"Explorer Bookmark" rešava ove izazove pružajući: 

Sistem inteligentnog označavanja koji omogućava brz pristup važnim fajlovima i folderima sa hijerarhijskom organizacijom 

Integraciju sa Git alatkom za verzionisanje koda pružajući razne olakšice u svakodnevnim aktivnostima, kao što su sinhronizacija, poređenje i ažuriranje fajlova i direktorijuma 

Integraciju sa GitHub Copilot-om čime omogućava sumarizaciju i generisanje dokumentacije za odabrane fajlove 

Poboljšano korisničko iskustvo kroz pojednostavljen tok rada sa kontekstualnim informacijama 

Funkcionalnosti za saradnju u timovima putem deljenja korisničkih konfiguracija, komentara i praćenje aktivnosti 

2. Detaljan prikaz funkcionalnosti 

2.1 Trenutni prototip korisničkog interfejsa 

A screen shot of a computer

AI-generated content may be incorrect. 

Slika 1. Work in progress za prikaz odabranih foldera i fajlova u ekstenziji 

A screenshot of a computer

AI-generated content may be incorrect. 

Slika 2. Work in progress prikaz interfejsa za korisnika nakon desnog klika na odabrani bookmark 

2.2 Sistem upravljanja bookmark-ovima 

Osnovna funkcionalnost sistema se zasniva na intuitivnom pristupu upravljanja bookmark-ovima kroz integraciju sa postojećim VS Code interfejsom. Korisnici mogu jednostavno označavati fajlove i foldere putem desnog klika u kontekstnom meniju da bi dodali ili uklonili bookmark iz sekcije, što predstavlja prirodan i poznati način interakcije. Hijerarhijska organizacija omogućava kategorizovanje bookmark-ova po sekcijama, što je posebno korisno kod rada sa velikim projektima koji sadrže mnoštvo različitih komponenti. 

Sistem obezbeđuje perzistentno skladištenje bookmark-ova specifično za svaki workspace, čime se omogućava održavanje konteksta između različitih sesija rada. Masovne operacije uključujući uklanjanje svih stavki i export/import funkcionalnosti omogućavaju efikasno upravljanje velikim kolekcijama bookmark-ova i olakšavaju deljenje konfiguracija između različitih razvojnih okruženja. 

Brzo pronalaženje bookmark-ova se ostvaruje kroz opcije pretrage i filtriranja, dok drag-and-drop interfejs omogućava intuitivno reorganizovanje bookmark strukture. 

2.3 Integracija sa Git alatom 

Integracija sa Git alatom predstavlja fundamentalni aspekt ekstenzije koji omogućava rad u timskom okruženju i verzionisanje koda. Sistem kontinuirano prati stanje fajlova u Git repozitorijumu, omogućavajući korisnicima da kroz bookmark interfejs imaju uvid u status modifikacija, dodavanja i brisanja fajlova. 

Diff vizualizacija omogućava pregled promena u bookmark-ovanim fajlovima kroz integrisani interfejs, eliminirajući potrebu za prebacivanje između različitih alata. Korisnici mogu direktno iz bookmark panela videti koja su mesta u kodu izmenjena, dodata ili uklonjena. Pristup istoriji promena za specifične fajlove putem commit istorije omogućava dublje razumevanje evolucije koda i identifikovanje trenutaka kada su implementirane ključne funkcionalnosti. 

GitHub integracija proširuje osnovne Git funkcionalnosti kroz direktnu povezanost sa cloud platformom. Kreiranje i povezivanje Pull Request-ova direktno iz bookmark-ova omogućava efikasniji code review proces. Korisnici mogu jednostavno kreirati PR za određen set fajlova koji su organizovani kroz bookmark sistem. Navigacija repozitorijuma omogućava direktan pristup GitHub web interfejsu za dodatne operacije, dok vizuelna diff reprezentacija kroz poređenje grana pomaže u razumevanju razlika između različitih verzija koda.  

2.4 AI-pokretane funkcionalnosti 

AI-generisani opisi kod fajlova se automatski kreiraju kroz analizu sadržaja na zahtev korisnika, omogućavajući programerima da brzo razumeju funkcionalnost komponenti bez potrebe za detaljnim čitanjem koda. 

Analiza složenosti koda pruža kvantitativne metrike i konkretne preporuke za poboljšanje kvaliteta koda. Ovaj sistem može identifikovati potencijalne problematične oblasti i predložiti strategije za rešavanje. 

2.5 Funkcionalnosti za saradnju 

Deljenje team bookmark-ova se ostvaruje kroz export/import sistem koji koristi JSON format za serijalizaciju podataka. Ovaj pristup omogućava lakše verzionisanje i održavanje bookmark konfiguracija, kao i njihovu integraciju sa postojećim workflow-ima za upravljanje projektima. 

3. Tehnički detalji implementacije 

3.1 Arhitektura sistema 

A diagram of a computer server

AI-generated content may be incorrect. 

Dijagram 1. Interakcije komponenti ekstenzije. 

3.2 Komunikacija između servisa 

3.2.1 ExtensionCore 

Koordinacija i komunikacija svih servisa kroz centralizovano upravljanje 

Prosleđivanje komandi između različitih komponenti putem event dispatching sistema 

Upravljanje inicijalizacijom i gašenjem servisa tokom lifecycle management procesa 

3.2.2 UI Servis ↔ ExtensionCore 

Rukovanje korisničkim komandama kroz korisničke click eventove, prečice na tastaturi i context menu akcije 

Ažuriranje UI stanja na osnovu promena podataka od strane drugih servisa 

Prikaz poruka korisniku (success, error, info) putem notifikacionog sistema 

3.2.3 Data Servis ↔ ExtensionCore  

Izvršavanje CRUD operacija (Create, Read, Update, Delete) nad bookmark podacima 

Čuvanje podataka u VS Code workspace storage zarad perzistiranja podataka kroz više sesija i za više korisnika 

3.2.4 External APIs ↔ ExtensionCore 

Izvršavanje Promise-based API poziva kroz asinhronu komunikaciju 

Upravljanje mrežnim greškama i timeout-ovima putem error handling sistema 

Autentikacija i autorizacija komunikacije sa Git, Github i Github Copilot API servisima 

Kontrola učestalosti API poziva putem rate limiting mehanizama 

3.3 Alati i tehnologije 

Tehnološka osnova ekstenzije se zasniva na modernom razvoju frontend aplikacija uz korišćenje TypeScript programskog jezika. Ovaj izbor je motivisan potrebom za sigurnošću tipova i održivošću koda, kao i pristupom velikom ekosistemu javno dostupnih biblioteka i aplikativnih interfejsa. Složeniji korisnički interfejsi se implementiraju kroz VS Code webview panele koji koriste standardne HTML/CSS/JavaScript tehnologije, dok se nativna integracija ostvaruje putem VS Code Extension API. 

Za integraciju sa Git-ovim aplikativnim interfejsom koristi se SimpleGit biblioteka. 

Za integraciju sa OpenAI aplikativnim interfejsom ne koristi se specijalna biblioteka, već se direktno uspostavlja cross-extension veza sa Github Copilot ekstenzijom. 

 

 

Uroš Vujošević 0209/2017 