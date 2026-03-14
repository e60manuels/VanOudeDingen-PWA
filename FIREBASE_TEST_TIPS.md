# Firebase Testing Tips

## 1. Lokaal testen met de Firebase Emulator
Voordat je wijzigingen live zet, kun je ze lokaal controleren met de emulator.
- **Commando:** `firebase emulators:start --only hosting`
- **URL:** [http://localhost:5000](http://localhost:5000)
- **Voordeel:** Directe feedback zonder deployment. Wijzigingen in de `public` map zijn na een refresh direct zichtbaar.

## 2. Testen op je smartphone (Lokaal)
Test de app op een echt toestel via je eigen wifi-netwerk.
1. Zorg dat smartphone en PC op hetzelfde wifi-netwerk zitten.
2. Zoek je IP-adres op PC: `ipconfig` (zoek naar `IPv4 Address`).
3. Open op je smartphone: `http://<JOUW-IP-ADRES>:5000`.
4. **Tip:** Gebruik dit om de laadvolgorde van afbeeldingen en de video fysiek te ervaren.

## 3. Deployen naar Live
Als alles lokaal naar wens werkt, gebruik je:
- **Commando:** `firebase deploy --only hosting`
