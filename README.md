# BikeSpeedSimulation 🚴‍♂️💨

Zaawansowany symulator prędkości kolarza i model predykcyjny oporów ruchu („What-If Aero Engine”). Pozwala analizować zarejestrowane trasy z plików `.fit`, badać wpływ wiatru atmosferycznego (prędkość, kierunek, profil logarytmiczny Hellmanna), modelować wirtualne wzniesienia metodą Chunga oraz prognozować zysk i stratę czasu przy zmianie warunków pogodowych lub strategii pacingu.

---

## 🌟 Główne Funkcjonalności

1. **Parser telemetrii FIT**:
   - Odczyt plików aktywności `.fit` (moc, prędkość, tętno, kadencja, współrzędne GPS, wysokość).
   - Wygładzanie profilu wysokości filtrem Savitzky-Golay usuwającym szum barometryczny.
   - Wyliczanie mocy znormalizowanej NP (algorytm dr. Andrew Coggana).
2. **Integracja meteorologiczna (Open-Meteo API)**:
   - Automatyczny pobór historycznych lub bieżących danych pogodowych wzdłuż trasy przejazdu.
   - Przeliczanie gęstości powietrza $\rho$ z ciśnienia i temperatury.
   - Profil pionowego ścinania wiatru (Hellmann power law) przeliczający wiatr ze stacji (10 m) na oś kolarza (~1.5 m).
3. **Silnik fizyczny i symulacja w dziedzinie odległości ($dx = 5\text{ m}$)**:
   - Wektorowa analiza wiatru pozornego ($v_{app}$, yaw angle $\beta$).
   - Bilans sił oporu: $F_{aero} + F_{gravity} + F_{rolling} = F_{propulsion}$.
   - **Model kinetyki bezwładności masy**: ciągłość energii kinetycznej zapobiegająca nielogicznym zapaściom prędkości na odcinkach toczenia/coasting ($P = 0\text{ W}$).
   - **Ekwiwalent Mocy**: solver numeryczny (metoda bisekcji) określający, ile watów kolarz musiałby generować w nowych warunkach, aby osiągnąć czas bazowy.
4. **Interaktywny panel sterowania**:
   - **Interaktywny kompas wiatru**: obrotowa tarcza kompasu ze wskaźnikiem wektora wiatru, obsługa przeciągania myszką oraz klikania.
   - **Symulacja bezwietrzna (Zero Wind)**: wyzerowanie wiatru ($0\text{ m/s}$) na całej trasie.
   - **Odwrócenie wiatru o 180°** oraz regulacja prędkości wiatru.
   - **Odwrócenie trasy („Jazda pod prąd”)**: odwrócenie kolejności trasy i znaków nachylenia ($s \to -s$).
   - **Modele pacingu**:
     - *Moc z pliku*: oryginalny profil watów z zachowaniem bezwładności masy.
     - *Stała średnia*: równy wysiłek na całej trasie.
     - *Adaptacyjny*: oszczędzanie energii na zjazdach, wyższa moc na podjazdach.
5. **Edukacyjne opisy i statystyki (Hover Tooltips)**:
   - Każda metryka i kontrolka posiada interaktywny dymek ze szczegółowym wyjaśnieniem fizycznym (dlaczego pętla pod wiatr zawsze przynosi stratę netto, jak działa bisekcja ekwiwalentu mocy, wzór Hellmanna, itp.).
6. **Wizualizacja ECharts & Leaflet**:
   - Wykresy profilu wysokości, prędkości bazowej vs symulowanej, watów i skumulowanej delty czasu.
   - Synchronizacja kursora myszy między wykresem a śladem GPS na mapie.

---

## 🚀 Uruchomienie Lokalne

### 1. Backend (FastAPI + Python 3.12)

```pwsh
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
uvicorn app.main:app --reload --port 8000
```

Backend uruchomi się pod adresem: `http://127.0.0.1:8000`. Dokumentacja Swagger API dostępna jest pod `http://127.0.0.1:8000/docs`.

Uruchomienie testów backendu:
```pwsh
.\.venv\Scripts\pytest backend/tests
```

### 2. Frontend (React + Vite + Tailwind)

```pwsh
cd frontend
npm install
npm run dev
```

Frontend uruchomi się pod adresem: `http://localhost:3000`.

---

## 🌐 Wdrożenie na GitHub Pages

Aplikacja jest w pełni przystosowana do działania jako statyczna strona SPA na **GitHub Pages** (wraz z wbudowanym trybem demonstracyjnym trasy 12 km pętli).

### Opcja A: Automatyczny deploy przez GitHub Actions (Zalecana)

W repozytorium skonfigurowany jest workflow `.github/workflows/deploy.yml`.

1. Wypchnij zmiany do gałęzi `main`:
   ```bash
   git push origin main
   ```
2. Przejdź do swojego repozytorium na GitHubie:
   - Wejdź w **Settings** -> **Pages**.
   - W sekcji **Build and deployment -> Source** wybierz **GitHub Actions**.
3. Przy każdym pushu do `main` aplikacja zostanie automatycznie zbudowana i opublikowana!

### Opcja B: Ręczny deploy z terminala (`gh-pages`)

Możesz wdrożyć frontend jednym poleceniem bezpośrednio ze swojego komputera:

```pwsh
cd frontend
npm run deploy
```

Polecenie zbuduje aplikację do katalogu `dist` i wypchnie go na dedykowaną gałąź `gh-pages`.
W ustawieniach repozytorium (**Settings -> Pages**) wybierz wtedy gałąź `gh-pages` jako źródło publikacji.