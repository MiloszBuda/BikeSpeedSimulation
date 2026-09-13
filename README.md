# BikeSpeedSimulation

Zaawansowany symulator dynamiki roweru, silnik predykcyjny wpływu warunków atmosferycznych (What-If Aero Engine) oraz moduł estymacji parametrów aerodynamicznych metodą wirtualnego przewyższenia Chunga (Virtual Elevation).

Aplikacja integruje dane telemetryczne z plików aktywności FIT (moc, prędkość, kadencja, współrzędne GPS, wysokość barometryczna) z wieloźródłowymi modelami meteorologicznymi (Open-Meteo ERA5, DWD Bright Sky, MET Norway, ISA) oraz numerycznym silnikiem całkowania równań ruchu w dziedzinie przestrzennej.

---

## Spis treści

1. Fundamenty fizyczne i równania ruchu
2. Aerodynamika i profil pionowy wiatru
3. Architektura skonstruowanego silnika symulacyjnego
4. Metoda wirtualnego przewyższenia Chunga (VE)
5. Algorytm ekwiwalentu mocy (Equivalent Power Solver)
6. Wielopoziomowa architektura integracji pogodowej (Failover)
7. Interfejs użytkownika i moduł wizualizacji
8. Struktura repozytorium
9. Uruchomienie lokalne i testy

---

## 1. Fundamenty fizyczne i równania ruchu

Ruch kolarza opisywany jest bilansem mocy mechanicznej generowanej przez układ mięśniowy oraz sił oporów środowiskowych i grawitacji. Równanie bilansu mocy w chwili $t$ ma postać:

$$P_{\text{legs}} \cdot \eta = P_{\text{aero}} + P_{\text{rolling}} + P_{\text{gravity}} + P_{\text{accel}}$$

gdzie:

- $P_{\text{legs}}$: chwilowa moc generowana przez kolarza [W],
- $\eta$: sprawność układu napędowego (łańcuch, zębatki, łożyska suportu i kółek wózka, typowo $0.95 - 0.98$),
- $P_{\text{aero}}$: moc tracona na pokonanie oporu aerodynamicznego [W],
- $P_{\text{rolling}}$: moc tracona na opory toczenia opon po nawierzchni [W],
- $P_{\text{gravity}}$: moc związana z pracą przeciwko sile ciężkości na wzniesieniu [W],
- $P_{\text{accel}}$: moc zużywana na zmianę energii kinetycznej układu [W].

Rozpisując moc jako iloczyn odpowiednich sił oporu oraz prędkości postępowej $v = \frac{dx}{dt}$:

$$P_{\text{legs}} \cdot \eta = \left[ F_{\text{aero}} + F_{\text{rolling}} + F_{\text{gravity}} + m_{\text{eff}} \left( \frac{dv}{dt} \right) \right] \cdot v$$

### 1.1. Siła oporu toczenia (Rolling Resistance)

Siła oporu toczenia wynika z niesprężystych deformacji karkasu opony i dętki w strefie kontaktu z podłożem:

$$F_{\text{rolling}} = C_{\text{rr}} \cdot m_{\text{total}} \cdot g \cdot \cos(\theta)$$

Dla kątów nachylenia drogi występujących w kolarstwie szosowym ($\theta < 20^\circ$), $\cos(\theta) \approx 1.0$, stąd:

$$F_{\text{rolling}} \approx C_{\text{rr}} \cdot m_{\text{total}} \cdot g$$

$$P_{\text{rolling}} \approx C_{\text{rr}} \cdot m_{\text{total}} \cdot g \cdot v$$

gdzie:

- $C_{\text{rr}}$: bezwymiarowy współczynnik oporu toczenia (np. $0.0030$ dla nowoczesnych opon szosowych tubeless, $0.0045$ dla opon treningowych, $0.0070$ dla opon gravelowych),
- $m_{\text{total}}$: całkowita masa układu (kolarz + rower + odzież + bidony + osprzęt) [kg],
- $g$: przyspieszenie ziemskie ($g = 9.80665\text{ m/s}^2$).

### 1.2. Siła ciężkości i nachylenie terenu (Gravity)

Siła grawitacji działająca wzdłuż stoku o kącie nachylenia $\theta$:

$$F_{\text{gravity}} = m_{\text{total}} \cdot g \cdot \sin(\theta) = m_{\text{total}} \cdot g \cdot \frac{dh}{ds} = m_{\text{total}} \cdot g \cdot s$$

gdzie:

- $s = \frac{dh}{dx}$: geometryczne nachylenie podłoża (slope),
- $s > 0$: podjazd (siła hamująca, praca ujemna),
- $s < 0$: zjazd (siła napędzająca, praca dodatnia).

Moc grawitacyjna:

$$P_{\text{gravity}} = m_{\text{total}} \cdot g \cdot s \cdot v$$

### 1.3. Bezwładność układu i masa efektywna (Inertial Kinetics)

Zmiana energii kinetycznej obejmuje zarówno ruch postępowy masy całkowitej, jak i ruch obrotowy kół roweru:

$$E_{\text{kin}} = \frac{1}{2} m_{\text{total}} v^2 + 2 \cdot \left[ \frac{1}{2} I_{\text{wheel}} \omega_{\text{wheel}}^2 \right]$$

Ponieważ $\omega_{\text{wheel}} = \frac{v}{r_{\text{wheel}}}$:

$$E_{\text{kin}} = \frac{1}{2} \left[ m_{\text{total}} + 2 \left( \frac{I_{\text{wheel}}}{r_{\text{wheel}}^2} \right) \right] v^2 = \frac{1}{2} m_{\text{eff}} v^2$$

gdzie masa efektywna $m_{\text{eff}}$ wynosi typowo:

$$m_{\text{eff}} \approx 1.03 \cdot m_{\text{total}}$$

Wypadkowa siła bezwładności w równaniu ruchu:

$$F_{\text{accel}} = m_{\text{eff}} \frac{dv}{dt} = m_{\text{eff}} \cdot v \frac{dv}{dx}$$

---

## 2. Aerodynamika i profil pionowy wiatru

### 2.1. Wektor wiatru pozornego (Apparent Wind)

Opór powietrza zależy od względnej prędkości kolarza względem otaczającej masy powietrza, czyli wektora wiatru pozornego $\vec{v}_{\text{app}}$:

$$\vec{v}_{\text{app}} = \vec{v}_{\text{cyclist}} + \vec{v}_{\text{wind}}$$

Dla kolarza poruszającego się z prędkością $v$ wzdłuż kierunku drogi o azymucie (bearing) $\phi_{\text{road}}$, przy wietrze rzeczywistym wiejącym z azymutu $\phi_{\text{wind}}$ z prędkością $w_{\text{cyclist}}$:

Kąt natarcia wiatru względem osi roweru (relative wind angle / yaw angle $\beta$):

$$\beta = |\phi_{\text{wind}} - \phi_{\text{road}}|$$

Rozkład wektora wiatru na składową wzdłużną (równoległą) i poprzeczną (boczną):

$$w_{\parallel} = w_{\text{cyclist}} \cdot \cos(\beta)$$

$$w_{\perp} = w_{\text{cyclist}} \cdot \sin(\beta)$$

- $w_{\parallel} > 0$: wiatr czołowy (headwind),
- $w_{\parallel} < 0$: wiatr w plecy (tailwind).

Całkowita prędkość wiatru pozornego:

$$v_{\text{app}} = \sqrt{(v + w_{\parallel})^2 + w_{\perp}^2}$$

Siła oporu aerodynamicznego zrzutowana na kierunek ruchu kolarza:

$$F_{\text{aero}} = \frac{1}{2} \rho \cdot C_d A \cdot v_{\text{app}} \cdot (v + w_{\parallel})$$

Moc oporu aerodynamicznego:

$$P_{\text{aero}} = F_{\text{aero}} \cdot v = \frac{1}{2} \rho \cdot C_d A \cdot \sqrt{(v + w_{\parallel})^2 + w_{\perp}^2} \cdot (v + w_{\parallel}) \cdot v$$

gdzie:

- $\rho$: gęstość powietrza atmosferycznego [$\text{kg/m}^3$],
- $C_d A$: efektywna powierzchnia oporu aerodynamicznego (iloczyn współczynnika oporu $C_d$ i pola powierzchni rzutu czołowego $A$) [$\text{m}^2$].

### 2.2. Termodynamika gazu i gęstość powietrza ($\rho$)

Gęstość suchego powietrza wyliczana jest bezpośrednio z równania stanu gazu doskonałego:

$$\rho = \frac{p}{R_{\text{specific}} \cdot T}$$

gdzie:

- $p$: ciśnienie atmosferyczne na wysokości trasy [Pa],
- $T$: temperatura bezwzględna [K] ($T = T_{^\circ\text{C}} + 273.15$),
- $R_{\text{specific}} = 287.058\text{ J/(kg}\cdot\text{K)}$: indywidualna stała gazowa dla suchego powietrza.

Dla warunków standardowych ISA ($p = 1013.25\text{ hPa}$, $T = 15^\circ\text{C}$): $\rho \approx 1.225\text{ kg/m}^3$.

### 2.3. Profil pionowego ścinania wiatru (Hellmann Power Law)

Stacje meteorologiczne oraz modele numeryczne prognoz pogody podają prędkość wiatru na standardowej wysokości referencyjnej $z_{\text{ref}} = 10\text{ m}$. Z powodu tarcia powietrza o szorstkość podłoża prędkość wiatru maleje w pobliżu ziemi.

Prędkość wiatru na wysokości środka oporu kolarza ($z_{\text{cyclist}} \approx 1.5\text{ m}$) przeliczana jest wykładniczym prawem Hellmanna:

$$w_{\text{cyclist}} = w_{10} \cdot \left( \frac{z_{\text{cyclist}}}{z_{\text{ref}}} \right)^\alpha$$

Dla terenu otwartego o umiarkowanej szorstkości ($z_0 = 0.03\text{ m}$) wykładnik profilu wynosi $\alpha \approx 0.20$ (lub profil logarytmiczny Prandtl-Karman):

$$w_{\text{cyclist}} \approx w_{10} \cdot \left( \frac{1.5}{10.0} \right)^{0.20} \approx 0.683 \cdot w_{10}$$

---

## 3. Architektura skonstruowanego silnika symulacyjnego

Silnik symulacyjny został zaimplementowany w języku Python w pakiecie `backend/app/services/`.

### 3.1. Dyskretyzacja przestrzenna ($dx = 5\text{ m}$)

Zamiast całkowania w dziedzinie czasu ($dt$), trasa przeliczana jest na siatkę równoodległych węzłów przestrzennych:

$$x_i = i \cdot dx, \quad \text{gdzie } dx = 5.0\text{ m}$$

Zalety dyskretyzacji przestrzennej w kolarstwie:

- Topografia terenu (profil wysokości, nachylenie $s_i$) oraz geometria drogi (azymut $\phi_i$, współrzędne GPS) są ścisłymi funkcjami pozycji geograficznej $x$, a nie czasu.
- Czas pokonania pojedynczego segmentu $dx$ wynika bezpośrednio z chwilowej prędkości symulowanej:
  $$dt_i = \frac{dx}{v_i}$$
- Całkowity czas przejazdu trasy:
  $$T_{\text{total}} = \sum_{i} dt_i = \sum_{i} \frac{dx}{v_i}$$

### 3.2. Rozdzielenie stanu równowagi od inercji (Decoupled Equilibrium & Dynamic Inertia)

W trybie `ORIGINAL` silnik rozdziela dwa odrębne zjawiska:

#### Krok 1: Wyznaczenie efektywnej mocy bazowej $P_{\text{eff}}$

Dla każdego węzła $i$ na podstawie rzeczywistej prędkości zarejestrowanej w pliku FIT ($v_{\text{base},i}$) oraz oryginalnych warunków pogodowych ($w_{\text{base},i}$):

$$F_{\text{aero,base}} = \frac{1}{2} \rho \cdot C_d A \cdot \sqrt{(v_{\text{base}} + w_{\parallel,\text{base}})^2 + w_{\perp,\text{base}}^2} \cdot (v_{\text{base}} + w_{\parallel,\text{base}})$$

$$F_{\text{res,base}} = m \cdot g \cdot \left( C_{\text{rr}} + \max(0, s) \right)$$

$$P_{\text{eff}} = (F_{\text{aero,base}} + F_{\text{res,base}}) \cdot v_{\text{base}}$$

#### Krok 2: Numeryczne wyznaczenie prędkości docelowej $v_{\text{target}}$

W zmienionych warunkach wiatrowych ($w_{\text{sim},i}$) kolarz dysponujący mocą $P_{\text{eff}}$ osiągnąłby w stanie stacjonarnym prędkość $v_{\text{target}}$ będącą ścisłym pierwiastkiem nieliniowego równania:

$$\left[ F_{\text{aero,sim}}(v_{\text{target}}) + F_{\text{res,base}} \right] \cdot v_{\text{target}} - P_{\text{eff}} = 0$$

Równanie to rozwiązywane jest zwektoryzowaną metodą bisekcji w przedziale $v \in [0.5, 45.0]\text{ m/s}$.

Własność zachowania bazy (Exact Baseline Invariance):  
Jeżeli $w_{\text{sim}} = w_{\text{base}}$, to z definicji $v_{\text{target}} = v_{\text{base}}$, a $\Delta v = 0.000000\text{ m/s}$.

#### Krok 3: Dynamika inercji i limity fizjologiczne

Zawodnik nie przeskakuje do nowej prędkości natychmiastowo, lecz dąży do niej z inercją pierwszego rzędu:

$$\Delta v_{\text{target}} = \operatorname{clip}(v_{\text{target}} - v_{\text{base}}, -\text{max\_dev}, +\text{max\_dev})$$

$$\alpha_{\text{inertia}} = 1.0 - \exp\left(-\frac{dt}{\tau}\right)$$

$$\Delta v_{\text{raw}} = \Delta v + \alpha_{\text{inertia}} \cdot (\Delta v_{\text{target}} - \Delta v)$$

Ograniczenie przyspieszenia:

$$-a_{\text{decel}} \cdot dt \le \Delta v_{\text{new}} - \Delta v \le +a_{\text{accel}} \cdot dt$$

Parametry kalibracyjne silnika:

- $\tau = 2.0\text{ s}$ (czas reakcji układu kolarz-rower),
- $a_{\text{accel}} = 0.9\text{ m/s}^2$ (maksymalne przyspieszenie w sprincie),
- $a_{\text{decel}} = 1.8\text{ m/s}^2$ (komfortowe wytracanie prędkości),
- $\text{max\_dev} = 16.0\text{ km/h}$ (maksymalne dopuszczalne odchylenie od prędkości bazowej).

#### Krok 4: Stabilizacja na stromych zjazdach i w strefie coasting ($P = 0\text{ W}$)

Jeżeli $P_{\text{eff}} < 15\text{ W}$ i $v_{\text{base}} < 10\text{ m/s}$ ($36\text{ km/h}$) na zjeździe ($s < -0.01$), oznacza to kontrolowane hamowanie. Wtedy $\Delta v$ jest ograniczana do przedziału $[-2.0, +3.0]\text{ km/h}$.

### 3.3. Silnik predykcyjny Heuna (Predictor-Corrector) dla pacingu

Dla trybów pełnej symulacji autonomicznej (`CONSTANT_AVG`, `ADAPTIVE_SLOPE`):

Równanie różniczkowe:

$$\frac{dv}{dx} = \frac{P_{\text{target}} \cdot \eta}{m_{\text{eff}} \cdot v^2} - \frac{F_{\text{aero}}(v) + F_{\text{rolling}} + F_{\text{gravity}}}{m_{\text{eff}} \cdot v}$$

Rozwiązywane metodą Heuna 2. rzędu:

1. Predyktor (krok Eulera):
   $$v_{\text{pred}} = v_i + f(x_i, v_i) \cdot dx$$
2. Korektor (średnia trapezowa pochodnych):
   $$v_{i+1} = v_i + \frac{1}{2} \left[ f(x_i, v_i) + f(x_{i+1}, v_{\text{pred}}) \right] \cdot dx$$

---

## 4. Metoda wirtualnego przewyższenia Chunga (VE)

### 4.1. Całka bilansu energii

Całkując równanie mocy po czasie:

$$\int P(t) \cdot \eta \, dt = \int F_{\text{aero}} \cdot v \, dt + \int F_{\text{rolling}} \cdot v \, dt + \int m \cdot g \left(\frac{dh}{dt}\right) dt + \int m_{\text{eff}} \cdot v \left(\frac{dv}{dt}\right) dt$$

Przekształcając względem przyrostu wysokości wirtualnej $\Delta h_{\text{virt}}$:

$$m \cdot g \cdot \Delta h_{\text{virt}} = \int \left[ P(t) \cdot \eta - F_{\text{rolling}} \cdot v - F_{\text{aero}} \cdot v \right] dt - \frac{1}{2} m_{\text{eff}} \left[ v(t)^2 - v(0)^2 \right]$$

Wysokość wirtualna w chwili $t$:

$$h_{\text{virt}}(t) = h_{\text{virt}}(0) + \int_{0}^{t} \left[ \frac{P(\tau) \cdot \eta}{m \cdot g} - C_{\text{rr}} \cdot v(\tau) - \frac{\rho \cdot C_d A}{2 \cdot m \cdot g} v_{\text{app}}(\tau)^2 v(\tau) \right] d\tau - \frac{v(t)^2 - v(0)^2}{2g}$$

### 4.2. Zasada domknięcia profilu i optymalizacja

Moduł Chunga w AeroBike minimalizuje funkcję błędu średniokwadratowego (RMSE):

$$J(C_d A, C_{\text{rr}}) = \sqrt{\frac{1}{N} \sum_{i=1}^{N} \left[ h_{\text{virt}}(t_i) - h_{\text{real}}(t_i) \right]^2}$$

za pomocą algorytmu optymalizacji bezgradientowej Powell / Nelder-Mead z ograniczeniami fizycznymi ($C_d A \in [0.18, 0.55]\text{ m}^2$, $C_{\text{rr}} \in [0.002, 0.012]$).

---

## 5. Algorytm ekwiwalentu mocy (Equivalent Power Solver)

Ekwiwalent mocy wyznacza stałą lub proporcjonalną moc z warunku:

$$T_{\text{sim}}(P_{\text{equiv}}) = T_{\text{base}}$$

Algorytm działania:

1. Zdefiniowanie monotonicznej funkcji czasu przejazdu $T(P)$ względem mocy średniej $P$.
2. Wyznaczenie przedziału poszukiwań: $P_{\text{low}} = 50\text{ W}$, $P_{\text{high}} = 1000\text{ W}$.
3. Zastosowanie zwektoryzowanej metody bisekcji do momentu osiągnięcia zbieżności $|T_{\text{sim}}(P_{\text{mid}}) - T_{\text{base}}| < 0.5\text{ s}$:
   - Obliczenie $T_{\text{mid}} = \text{simulate}(P_{\text{mid}})$,
   - Jeśli $T_{\text{mid}} > T_{\text{base}}$ (za wolno) $\to P_{\text{low}} = P_{\text{mid}}$,
   - Jeśli $T_{\text{mid}} < T_{\text{base}}$ (za szybko) $\to P_{\text{high}} = P_{\text{mid}}$.
4. Maksymalnie 12 kroków bisekcji gwarantuje zbieżność poniżej $0.2\text{ W}$ w czasie $< 25\text{ ms}$.

---

## 6. Wielopoziomowa architektura integracji pogodowej (Failover)

1. **Poziom 1 (Podstawowy):** Open-Meteo ERA5 Reanalysis & Forecast API
2. **Poziom 2 (Pierwszy fallback):** Bright Sky API (Deutscher Wetterdienst DWD)
3. **Poziom 3 (Drugi fallback):** MET Norway Frost API
4. **Poziom 4 (Model deterministyczny ISA):** International Standard Atmosphere ($p_0 = 1013.25\text{ hPa}$, $T_0 = 15^\circ\text{C}$, $\rho = 1.225\text{ kg/m}^3$, $w_{\text{base}} = 2.0\text{ m/s}$)

---

## 7. Interfejs użytkownika i moduł wizualizacji

Frontend zbudowano w oparciu o **React 18**, **TypeScript**, **Tailwind CSS** oraz **Vite**:

- **Interaktywny kompas wiatru (WindCompass):** Wskazuje wektor przepływu strumienia wiatru (obrót igły o $180^\circ$, podaje kąt natarcia i źródło meteo).
- **Przełącznik motywu (Dark / Light Mode):** Pełna obsługa trybu ciemnego i jasnego (`localStorage`).
- **Wielojęzyczność (PL / EN):** Moduł i18n obsługujący pełne tłumaczenie interfejsu.
- **Wykresy telemetryczne (Apache ECharts):** Zsynchronizowany dwupoziomowy profil wysokości, prędkości, mocy oraz delty czasu.
- **Interaktywna mapa trasy (Leaflet):** Segmentacja polilinii GPS według kąta natarcia wiatru pozornego.

---

## 8. Struktura repozytorium

```
BikeSpeedSimulation/
|-- backend/
|   |-- app/
|   |   |-- api/
|   |   |   +-- endpoints.py             # Endpointy REST: /process, /simulate, /estimate-cda, /health
|   |   |-- core/
|   |   |   +-- config.py                # Konfiguracja srodowiskowa i CORS
|   |   |-- models/
|   |   |   +-- schemas.py               # Pydantic v2 schematy wejsciowe i wyjsciowe
|   |   |-- services/
|   |   |   |-- fit_parser.py            # Parser binarny FIT, wygladzanie SG, wyliczanie NP
|   |   |   |-- weather_service.py       # Pobor pogody, kaskadowy fallback (Open-Meteo, DWD, ISA)
|   |   |   |-- physics_solver.py        # Numeryczny solver rownania mocy, bisekcja, bilans sil
|   |   |   |-- simulation_engine.py     # Dyskretny silnik przestrzenny dx=5m, pacing, inercja
|   |   |   |-- chung_service.py         # Metoda Virtual Elevation, estymacja CdA i Crr
|   |   |   +-- wind_analysis.py         # Analiza wektora pozornego, rozklad czolowy/boczny
|   |   +-- main.py                      # Punkt wejsciowy FastAPI
|   |-- tests/                           # 59 testow jednostkowych i integracyjnych pytest
|   |-- pyproject.toml                   # Zaleznosci backendu (Poetry / Pip)
|   +-- Dockerfile                       # Obraz produkcyjny dla platformy Render
|
|-- frontend/
|   |-- src/
|   |   |-- components/
|   |   |   |-- Header.tsx               # Nawigacja, status serwera, przelacznik motywu i jezyka
|   |   |   |-- FileUpload.tsx           # Drag-and-drop plikow FIT
|   |   |   |-- SummaryCards.tsx         # Karty podsumowania delty czasu, watow i predkosci
|   |   |   |-- SimulationControls.tsx   # Panel sterowania wiatrem, suwaki, pacing, parametry
|   |   |   |-- WindCompass.tsx          # Interaktywna roza wiatrow ze strumieniem przeplywu
|   |   |   |-- TelemetryCharts.tsx      # Wykresy ECharts z dwoma siatkami i synchronizacja
|   |   |   |-- RouteMap.tsx             # Mapa Leaflet z kolorowaniem wektorow wiatru
|   |   |   |-- ChungAnalysisModal.tsx   # Modal profilu wirtualnej wysokosci Chunga
|   |   |   +-- Tooltip.tsx              # Popover edukacyjny z wyjasnieniem fizyki
|   |   |-- i18n/
|   |   |   +-- translations.ts          # Slowniki tlumaczen PL / EN
|   |   |-- services/
|   |   |   +-- api.ts                   # Klient HTTP komunikacji z backendem Render
|   |   |-- utils/
|   |   |   +-- storage.ts               # Persystencja parametrow CdA/Crr/masy w localStorage
|   |   |-- App.tsx                      # Glowny kontener stanu aplikacji
|   |   +-- main.tsx                     # Bootstrapper React
|   |-- package.json                     # Zaleznosci npm
|   |-- tailwind.config.js               # Konfiguracja Tailwind (darkMode: 'class')
|   +-- vite.config.ts                   # Konfiguracja bundlera Vite
+-- README.md                            # Niniejsza dokumentacja techniczna
```

---

## 9. Uruchomienie lokalne i testy

### 9.1. Wymagania wstępne

- Python 3.11 lub 3.12
- Node.js 18+ oraz npm

### 9.2. Uruchomienie backendu

```bash
cd backend
python -m venv .venv

# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1

# Linux / macOS:
source .venv/bin/activate

pip install -e .
uvicorn app.main:app --reload --port 8000
```

Dokumentacja OpenAPI (Swagger UI): http://127.0.0.1:8000/docs

Uruchomienie pełnego pakietu testów:

```Bash
pytest backend/tests
```

### 9.3. Uruchomienie frontendu

```Bash
cd frontend
npm install
npm run dev
```

Aplikacja dostępna pod adresem: http://localhost:3000

Weryfikacja typowania i budowanie produkcyjne:

```bash
npm run build
```
