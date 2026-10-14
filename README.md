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
7. Auto-kalibracja parametrów fizycznych (CdA, Crr, η) z wielu aktywności
8. Bezpośrednia integracja ze Strava API
9. Interfejs użytkownika i moduł wizualizacji
10. Technologie, frameworki i biblioteki (Tech Stack)
11. Struktura repozytorium
12. Uruchomienie lokalne i testy

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

$$
\Delta v_{\text{target}} = \begin{cases} 
-\text{max}\_\text{dev}, & \text{gdy } v_{\text{target}} - v_{\text{base}} < -\text{max}\_\text{dev} \\
v_{\text{target}} - v_{\text{base}}, & \text{gdy } |v_{\text{target}} - v_{\text{base}}| \le \text{max}\_\text{dev} \\
+\text{max}\_\text{dev}, & \text{gdy } v_{\text{target}} - v_{\text{base}} > \text{max}\_\text{dev}
\end{cases}
$$

* $\text{max}\_\text{dev} = 16.0\text{ km/h}$ (maksymalne dopuszczalne odchylenie od prędkości bazowej).
$$\alpha_{\text{inertia}} = 1.0 - \exp\left(-\frac{dt}{\tau}\right)$$

$$\Delta v_{\text{raw}} = \Delta v + \alpha_{\text{inertia}} \cdot (\Delta v_{\text{target}} - \Delta v)$$

Ograniczenie przyspieszenia:

$$-a_{\text{decel}} \cdot dt \le \Delta v_{\text{new}} - \Delta v \le +a_{\text{accel}} \cdot dt$$

Parametry kalibracyjne silnika:

- $\tau = 2.0\text{ s}$ (czas reakcji układu kolarz-rower),
- $a_{\text{accel}} = 0.9\text{ m/s}^2$ (maksymalne przyspieszenie w sprincie),
- $a_{\text{decel}} = 1.8\text{ m/s}^2$ (komfortowe wytracanie prędkości),
- $\text{max}_\text{dev} = 16.0\text{ km/h}$ (maksymalne dopuszczalne odchylenie od prędkości bazowej).

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

---

## 7. Auto-kalibracja parametrów fizycznych ($CdA$, $Crr$, $\eta$) z wielu aktywności

Moduł auto-kalibracji (`CalibrationService`) rozwiązuje fundamentalny problem estymacji parametrów oporów ruchu: zamiast zgadywać aerodynamikę ($CdA$), opory toczenia ($Crr$) i sprawność napędu ($\eta$), estymuje je globalnie na podstawie zbioru 5–15 rzeczywistych przejazdów szosowych z miernikiem mocy.

### 7.1. Równanie całkowego bilansu energii okien czasowych

Aktywności dzielone są na ruchome okna czasowe $W_k$ o długości $5 - 15\text{ min}$ (domyślnie $300\text{ s}$ z przesunięciem $120\text{ s}$). Zamiast ciągłej integracji wirtualnej wysokości (gdzie dryf całkowania kumuluje się w czasie), na każdym oknie $k$ formułowany jest bilans energii mechanicznej:

$$m g \Delta h_k + \frac{1}{2} m \Delta(v^2)_k = \eta \int_{W_k} P(t) \, dt - CdA \int_{W_k} \frac{1}{2} \rho(t) \, v_{\text{app}}(t)^2 \, v(t) \, dt - Crr \cdot m g \int_{W_k} v(t) \, dt$$

Równanie to jest **ściśle liniowe** względem wektora parametrów $\mathbf{x} = [\eta, CdA, Crr]^T$:

$$\mathbf{y}_k = A_{k, 0} \cdot \eta + A_{k, 1} \cdot CdA + A_{k, 2} \cdot Crr$$

gdzie:
- $\mathbf{y}_k = m g \Delta h_k + \frac{1}{2} m (v_{\text{end}}^2 - v_{\text{start}}^2)$ — przyrost energii potencjalnej i kinetycznej,
- $A_{k, 0} = \int_{W_k} P(t) \, dt$ — praca mechaniczna wygenerowana na korbie,
- $A_{k, 1} = -\int_{W_k} \frac{1}{2} \rho v_{\text{app}}^2 v \, dt$ — całka aerodynamiczna oporu wiatru pozornego,
- $A_{k, 2} = -m g \int_{W_k} v \, dt = -m g \cdot \Delta s_k$ — całka drogi oporu toczenia.

### 7.2. Selekcja i filtracja jakościowa danych

Algorytm kalibracji odrzuca fragmenty zakłócające bilans energii:
1. **Wykluczenie trenażerów i estymat mocy:** Akceptowane są wyłącznie aktywności outdoorowe (`trainer = false`) z fizycznym miernikiem mocy (`device_watts = true`).
2. **Filtracja rozgrzewki:** Pierwsze 5 minut każdej jazdy jest odrzucane (niestabilny opór opon, rozgrzewka napędu).
3. **Maska postojów i niskich prędkości:** Okna ze średnią prędkością $v < 2.5\text{ m/s}$ ($9\text{ km/h}$) są odrzucane.
4. **Maska hamowania na zjazdach:** Wycinane są segmenty, w których ujemne przyspieszenie wskazuje na użycie hamulców ($f_{\text{brake}} > 0.05\text{ N/kg}$).
5. **Wymóg różnicowania prędkości:** Szeroki rozrzut prędkości w oknach umożliwia odróżnienie oporu toczenia ($F_{\text{rr}} \propto v$) od aerodynamiki ($F_{\text{aero}} \propto v^3$).

### 7.3. Ograniczony i Bayesowsko regularyzowany solwer (Bounded LS)

Układ równań ze wszystkich okien $M$ składany jest w macierz $\mathbf{A} \in \mathbb{R}^{M \times 3}$ oraz wektor $\mathbf{y} \in \mathbb{R}^M$. Rozwiązywany jest metodą ograniczonego najmniejszego błędu kwadratowego (`scipy.optimize.lsq_linear`):

$$\min_{\mathbf{x}} \|\mathbf{A}_{\text{aug}} \mathbf{x} - \mathbf{y}_{\text{aug}}\|_2^2 \quad \text{przy warunku} \quad \mathbf{lb} \le \mathbf{x} \le \mathbf{ub}$$

Zastosowane fizyczne granice i priory szosowe:
- $\eta \in [0.940, 0.985]$, prior $\eta_0 = 0.970$ (sprawność napędu 2x/1x),
- $CdA \in [0.200, 0.550]\text{ m}^2$, prior $CdA_0 = 0.340\text{ m}^2$ (kolarz szosowy w chwycie na łapach),
- $Crr \in [0.0028, 0.0065]$, prior $Crr_0 = 0.0042$ (dobre opony szosowe na asfalcie).

Wagi regularyzacji bayesowskiej są skalowane normami kolumnowymi macierzy $\mathbf{A}$, co zabezpiecza algorytm przed ucieczką współczynnika toczenia $Crr$ do sztucznych wartości granicznych kosztem aerodynamiki.

### 7.4. Heurystyka identyfikowalności $\eta$

Sprawność napędu $\eta$ jest nierozróżnialna od błędu wzmocnienia miernika mocy na trasach płaskich. Wyznacza ją wyłącznie człon grawitacyjny $m g \Delta h$.
- Jeśli zróżnicowanie przewyższeń w oknach wynosi $\sigma(\Delta h) < 4.0\text{ m}$, łączny wznios $< 80\text{ m}$ lub maksymalny wznios w oknie $< 15\text{ m}$:
  - Sprawność napędu zostaje automatycznie zablokowana na wartości $\eta = 0.970$.
  - Przeniesiony zostaje człon mocy na prawą stronę: $\mathbf{y}_{\text{sub}} = \mathbf{y} - 0.97 \cdot \mathbf{A}_{:, 0}$.
  - Rozwiązywany jest stabilny układ dwuparametrowy dla $(CdA, Crr)$, a użytkownik otrzymuje czytelny komunikat diagnostyczny.

### 7.5. Walidacja krzyżowa Leave-One-Out (LOO)

Dokładność kalibracji weryfikowana jest walidacją krzyżową:
1. Model estymuje parametry na zbiorze $N - 1$ aktywności.
2. Pominięta $N$-ta aktywność jest symulowana numerycznym silnikiem Heuna z jej rzeczywistym profilem mocy i pogodą ERA5.
3. Obliczany jest błąd średniokwadratowy prędkości ($RMSE\text{ [km/h]}$) oraz błąd bezwzględny całkowitego czasu przejazdu.
4. Zaakceptowane parametry są automatycznie podstawiane do symulatora z plakietką statusu (np. `auto, n=12, CdA 0.338 ±0.012`).

---

## 8. Bezpośrednia integracja ze Strava API

Integracja ze Stravą eliminuje konieczność manualnego eksportu i przeciągania plików `.fit`.

### 8.1. Architektura OAuth 2.0 i bezpieczeństwo danych

- **Flow autoryzacji:** Standard OAuth 2.0 Authorization Code flow z zakresem `activity:read_all` (umożliwia dostęp także do jazd oznaczonych statusem prywatnym).
- **Bezpieczeństwo tokenów:** Tokeny dostępu (`access_token`) i odświeżania (`refresh_token`) są przechowywane wyłącznie po stronie serwera w lokalnej bazie SQLite (`backend/data/strava.db`). Tokeny **nigdy nie trafiają do `localStorage` przeglądarki**.
- **Automatyczna rotacja:** Token dostępu jest weryfikowany przed każdym żądaniem i odświeżany automatycznie, gdy do wygaśnięcia pozostaje mniej niż 5 minut.
- **Zgodność z API Agreement Stravy:** Dane są przechowywane ściśle per-użytkownik, nie są agregowane ani przekazywane do zewnętrznych modeli sztucznej inteligencji.

### 8.2. Pobieranie strumieni telemetrycznych 1 Hz

Ponieważ API Stravy nie udostępnia bezpośrednio oryginalnych plików `.fit`, aplikacja wykorzystuje endpoint strumieni (`GET /activities/{id}/streams`):
- Pobierane strumienie: `time`, `distance`, `latlng`, `altitude`, `velocity_smooth`, `watts`, `cadence`, `temp`, `moving`.
- **`StravaAdapter`:**
  - Prędkość naziemna wyliczana jest bezpośrednio z przyrostów odległości $\Delta d / \Delta t$, co eliminuje nadmierne wygładzenie strumienia `velocity_smooth` i zachowuje dynamikę przyspieszeń.
  - Wyliczany jest azymut geograficzny (great-circle initial bearing) z kolejnych punktów GPS lat/lng.
  - Generowane są struktury `TrackPoint` i `FitSummary` w 100% zgodne z pipeline'em parsera FIT.

### 8.3. Rate-Limiting i dwupoziomowy Cache

- Odpowiedzi nagłówkowe Stravy (`X-RateLimit-Limit`, `X-RateLimit-Usage`) są monitorowane w czasie rzeczywistym pod kątem limitów (200 req / 15 min, 2000 req / dobę).
- Pobrane strumienie są trwale buforowane w lokalnej bazie SQLite, dzięki czemu ponowne uruchomienie symulacji lub kalibracji nie zużywa limitów API.
- Wygodny interfejs **1-kliknięcia** w modalu Stravy z automatycznym wsparciem dla podścieżek hostingu GitHub Pages (`/BikeSpeedSimulation/`).

---

## 9. Interfejs użytkownika i moduł wizualizacji

Frontend zbudowano w oparciu o **React 18**, **TypeScript**, **Tailwind CSS** oraz **Vite**:

- **Auto-Kalibracja aero (AutoCalibrationModal):** Okno konfiguracji masy, wyboru aktywności (pliki FIT lub pobrane ze Stravy), postępu estymacji parametrów $CdA \pm \sigma$, $Crr \pm \sigma$, $\eta \pm \sigma$ oraz wyników walidacji krzyżowej Leave-One-Out.
- **Integracja Strava (StravaModal):** Panel 1-kliknięcia z podglądem profilu zawodnika, filtrowaniem aktywności z miernikiem mocy, pobieraniem strumieni i bezpośrednim ładowaniem trasy do symulatora.
- **Interaktywny kompas wiatru (WindCompass):** Wskazuje wektor przepływu strumienia wiatru (obrót igły o $180^\circ$, podaje kąt natarcia i źródło meteo) ze zwartymi presetami kierunków N, E, S, W i szybkimi obrotami.
- **Zaawansowane parametry fizyczne (SimulationControls):** Wyrównane, wyśrodkowane pola edycji masy, $CdA$, $Crr$ i $\eta$ z plakietką informującą o automatycznej kalibracji oraz przyciskiem resetu do wartości domyślnych.
- **Przełącznik motywu (Dark / Light Mode):** Pełna obsługa trybu ciemnego i jasnego z persystencją w `localStorage`.
- **Wielojęzyczność (PL / EN):** Zunifikowany moduł i18n ze spójnym układem nagłówka na ekranach desktopowych i mobilnych.
- **Wykresy telemetryczne (Apache ECharts):** Zsynchronizowany dwupoziomowy profil wysokości, prędkości, mocy oraz delty czasu z interaktywnym kursorem.
- **Interaktywna mapa trasy (Leaflet):** Segmentacja polilinii GPS według kąta natarcia wiatru pozornego.

---

## 10. Technologie, frameworki i biblioteki (Tech Stack)

Aplikacja została zaprojektowana w nowoczesnej architekturze zorientowanej na wysoką wydajność numeryczną (Python / C / Rust) po stronie serwera oraz płynną, reaktywną wizualizację wielotysięcznych serii czasowych telemetrii (TypeScript / React) po stronie klienta.

### 10.1. Backend & Obliczenia Numeryczne (Python)

| Technologia / Biblioteka | Wersja | Rola w architekturze i kluczowe zastosowanie |
| :--- | :--- | :--- |
| **Python** | `>= 3.12` | Podstawa całego środowiska obliczeniowego, asynchronicznego API i integracji zewnętrznych. |
| **FastAPI** | `>= 0.111.0` | Asynchroniczny framework REST API zgodny ze standardem ASGI; automatyczne generowanie interaktywnej dokumentacji Swagger UI / OpenAPI i wstrzykiwanie zależności (`Depends`). |
| **Uvicorn** | `>= 0.30.0` | Produkcyjny serwer ASGI wspierany pętlą zdarzeń `uvloop` oraz parserem protokołów `httptools`. |
| **Pydantic V2** | `>= 2.7.0` | Ścisła walidacja i serializacja danych z silnikiem `pydantic-core` napisanym w Rust; gwarancja spójności schematów telemetrii, konfiguracji symulacji i raportów kalibracji. |
| **NumPy** | `>= 1.26.0` | Zwektoryzowane operacje macierzowe, trygonometria wektorów wiatru pozornego oraz dyskretyzacja przestrzenna trasy $dx = 5\text{ m}$. |
| **SciPy** | `>= 1.12.0` | Aparat naukowo-optymalizacyjny: solwer `scipy.optimize.lsq_linear` z regularyzacją bayesowską (auto-kalibracja $CdA, Crr, \eta$), bezgradientowa minimalizacja Powell / Nelder-Mead (metoda Chunga) oraz filtr wygładzający Savitzky'ego-Golaya (`scipy.signal.savgol_filter`). |
| **Polars** | `>= 1.0.0` | Błyskawiczna biblioteka DataFrame w Rust wykorzystująca przetwarzanie wielowątkowe i architekturę pamięci Apache Arrow do operacji na seriach czasowych. |
| **fitdecode** | `>= 0.11.0` | Niskopoziomowy parser binarnego formatu Garmin/ANT+ FIT (`.fit`) do strumieniowej deserializacji rekordów 1 Hz bez zbędnego narzutu pamięciowego. |
| **HTTPX** | `>= 0.27.0` | W pełni asynchroniczny klient HTTP z obsługą HTTP/2, poolingiem połączeń i konfigurowalnymi timeoutami dla kaskadowego pobierania pogody oraz integracji Stravy. |
| **SQLite3** | Wbudowane | Lekka baza relacyjna (`strava.db`) przechowująca bezpiecznie tokeny OAuth 2.0 (nigdy nieprzekazywane do przeglądarki) oraz 2-poziomowy cache strumieni telemetrycznych. |

### 10.2. Frontend & Interfejs Użytkownika (TypeScript / React)

| Technologia / Biblioteka | Wersja | Rola w architekturze i kluczowe zastosowanie |
| :--- | :--- | :--- |
| **React** | `18.3.1` | Deklaratywny silnik UI; wykorzystanie Concurrent Mode, kompozycji komponentów funkcyjnych oraz memoizacji obliczeń (`useMemo`, `useCallback`). |
| **TypeScript** | `5.4.5` | Statyczna kontrola typów w całej aplikacji klienckiej, gwarantująca pełną zgodność kontraktów z modelami Pydantic na backendzie. |
| **Vite** | `5.3.1` | Narzędzie budujące nowej generacji oparte na Rollup i esbuild; natychmiastowe odświeżanie modułów HMR i zoptymalizowany bundling produkcyjny. |
| **Tailwind CSS** | `3.4.4` | Silnik stylów CSS utility-first z kompilatorem JIT; pełna responsywność (RWD) oraz bezproblemowa obsługa motywów Dark / Light (`darkMode: 'class'`). |
| **Apache ECharts** | `5.5.0` | Silnik grafiki wektorowej/Canvas (`echarts-for-react 3.0.2`); zsynchronizowane dwupoziomowe wykresy profilu wysokości, prędkości, mocy i delty czasu z interaktywnym kursorem i zoomem. |
| **Leaflet** | `1.9.4` | Biblioteka GIS (`react-leaflet 4.2.1`) do interaktywnej prezentacji trasy GPS z segmentacją polilinii według wektorów wiatru pozornego. |
| **Lucide React** | `0.395.0` | Zestaw wektorowych ikon interfejsu (róża wiatrów, metryki, nawigacja). |

### 10.3. Zewnętrzne API i Źródła Meteorologiczne

- **Open-Meteo ERA5 Reanalysis & Forecast API:** Globalna reanaliza atmosferyczna ERA5 i numeryczne prognozy o wysokiej rozdzielczości (prędkość i azymut wiatru na $10\text{ m}$, porywy, temperatura, ciśnienie, wilgotność).
- **DWD Bright Sky API:** Bezpośrednie pobieranie danych ze stacji Deutscher Wetterdienst (niemiecka służba meteorologiczna) jako 1. poziom fallbacku.
- **MET Norway Frost API:** Oficjalne norweskie dane meteorologiczne jako 2. poziom fallbacku.
- **Model Deterministyczny ISA:** Międzynarodowa Atmosfera Wzorcowa (International Standard Atmosphere) jako fizyczny fallback gęstości powietrza na wysokości n.p.m.
- **Strava API v3:** Pełny protokół autoryzacji OAuth 2.0 (Authorization Code Flow) oraz strumieniowy odczyt telemetrii 1 Hz (`/activities/{id}/streams`).

### 10.4. Narzędzia Testowe, CI/CD i Infrastruktura

- **pytest & pytest-asyncio (`>= 8.2.0`, `>= 0.23.0`):** Automatyczny pakiet testów jednostkowych i asynchronicznych integracji modeli fizycznych i endpointów.
- **respx (`>= 0.21.0`):** Mockowanie zapytań HTTP na potrzeby deterministycznych testów odporności na awarie API pogodowych i Stravy.
- **GitHub Actions:** Zautomatyzowany potok CI/CD budujący aplikację kliencką i publikujący statyczny build na **GitHub Pages**.
- **Render Cloud:** Hosting chmurowy asynchronicznej usługi backendowej FastAPI w środowisku produkcyjnym pod adresem `https://bikespeedsimulation.onrender.com`.

---

## 11. Struktura repozytorium

```
BikeSpeedSimulation/
|-- backend/
|   |-- app/
|   |   |-- api/
|   |   |   |-- endpoints.py             # Endpointy symulacji: /process, /simulate, /estimate-cda, /health
|   |   |   |-- calibration_endpoints.py # Endpointy kalibracji: /calibrate-fit, /calibrate-strava, /latest
|   |   |   +-- strava_endpoints.py      # Endpointy Stravy: /auth-url, /exchange-token, /activities, /process
|   |   |-- config.py                    # Konfiguracja srodowiskowa, stale fizyczne i granice kalibracji
|   |   |-- schemas/
|   |   |   |-- fit.py                   # Pydantic modele telemetrii FIT i punktow wzbogaconych
|   |   |   |-- simulation.py            # Schematy symulacji What-If i pacingu
|   |   |   |-- calibration.py           # Schematy okien energii, zadan kalibracji i raportu LOO
|   |   |   +-- strava.py                # Schematy autoryzacji OAuth, zawodnika i aktywnosci Stravy
|   |   |-- services/
|   |   |   |-- fit_parser.py            # Parser binarny FIT, wygladzanie SG, NP i metryki
|   |   |   |-- weather_service.py       # Pobor pogody, kaskadowy fallback (Open-Meteo, DWD, MET Norway, ISA)
|   |   |   |-- physics_solver.py        # Numeryczny solver rownania mocy, bisekcja, bilans sil
|   |   |   |-- simulation_engine.py     # Dyskretny silnik przestrzenny dx=5m, metoda Heuna, pacing
|   |   |   |-- chung_service.py         # Metoda Virtual Elevation, profil wirtualnej wysokosci
|   |   |   |-- calibration_service.py   # Bilans energii okien, lsq_linear (CdA, Crr, eta), walidacja LOO
|   |   |   |-- strava_service.py        # Klient Strava v3 API, zarzadzanie tokenami, SQLite cache
|   |   |   |-- strava_adapter.py        # Adapter strumieni Stravy do TrackPoint i FitSummary
|   |   |   +-- wind_analysis.py         # Analiza wektora pozornego, rozklad czolowy/boczny
|   |   +-- main.py                      # Punkt wejsciowy FastAPI z rejestracja routerow
|   |-- data/
|   |   +-- strava.db                    # Lokalna baza SQLite na tokeny i strumienie Stravy
|   |-- tests/                           # 76 testow jednostkowych i integracyjnych pytest
|   |   |-- test_api.py                  # Testy endpointow bazowych symulacji
|   |   |-- test_calibration_service.py  # Testy okien energii, odzyskiwania parametrów i walidacji LOO
|   |   |-- test_strava_service.py       # Testy adaptera strumieni, obliczen predkosci i SQLite
|   |   +-- test_calibration_and_strava_api.py # Testy API autoryzacji i kalibracji
|   |-- pyproject.toml                   # Zaleznosci backendu (FastAPI, Scipy, Numpy, Httpx, Respx)
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
|   |   |   |-- AutoCalibrationModal.tsx # Modal wielo-aktywnosciowej kalibracji CdA/Crr/eta
|   |   |   |-- StravaModal.tsx          # Modal eksploratora aktywnosci i 1-click logowania Strava
|   |   |   +-- Tooltip.tsx              # Popover edukacyjny z wyjasnieniem fizyki
|   |   |-- i18n/
|   |   |   +-- translations.ts          # Slowniki tlumaczen PL / EN
|   |   |-- services/
|   |   |   +-- api.ts                   # Klient HTTP komunikacji z backendem Render (symulacja, Strava, kalibracja)
|   |   |-- types/
|   |   |   +-- simulation.ts            # Definicje typow TypeScript dla calej aplikacji
|   |   |-- utils/
|   |   |   +-- storage.ts               # Persystencja parametrow CdA/Crr/masy w localStorage
|   |   |-- App.tsx                      # Glowny kontener stanu aplikacji
|   |   +-- main.tsx                     # Bootstrapper React
|   |-- package.json                     # Zaleznosci npm (React, ECharts, Leaflet, Lucide, Tailwind)
|   |-- tailwind.config.js               # Konfiguracja Tailwind CSS (darkMode: 'class')
|   +-- vite.config.ts                   # Konfiguracja bundlera Vite
+-- README.md                            # Niniejsza dokumentacja techniczna
```

---

## 12. Uruchomienie lokalne i testy

### 12.1. Wymagania wstępne

- Python 3.12+
- Node.js 18+ oraz npm

### 12.2. Uruchomienie backendu

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

Uruchomienie pełnego pakietu 76 testów jednostkowych i integracyjnych:

```bash
pytest backend/tests
```

### 12.3. Uruchomienie frontendu

```bash
cd frontend
npm install
npm run dev
```

Aplikacja dostępna pod adresem: http://localhost:3000 (lub http://localhost:5173)

Weryfikacja typowania i budowanie produkcyjne:

```bash
npm run build
```
