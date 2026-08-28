# Kucher

Static frontend prototype for the Kucher online store.

## Included

- Product catalog and product pages
- Shopping cart with add-to-cart animation
- Immediate cart item deletion and clear-all
- Delivery page with Yandex Maps
- K338B store location: `55.993872, 37.214714`
- 5 km delivery radius as a real geographic map circle
- Russia delivery section with transport-company links
- Demo registration/login by email or phone
- Personal cabinet with current cart and order history

## Run locally

Use a local HTTP server:

```bash
python -m http.server 8000
```

Open `http://localhost:8000/`.

## GitHub Pages

1. Push this repository to GitHub.
2. Open **Settings → Pages**.
3. Choose **Deploy from a branch**.
4. Select `main` and `/ (root)`.

## Yandex Maps

The delivery page uses Yandex Maps JavaScript API. Before publishing, replace the placeholder `YOUR_YANDEX_MAPS_API_KEY` in `delivery.html` with a valid key and configure the appropriate HTTP-referrer restrictions.

## Prototype limitation

Registration, user data, cart state and order history are currently frontend-only and stored in browser storage. This is not a production authentication system.

## Next step

Recommended backend stack:

- Python
- Django / Django REST Framework
- PostgreSQL
- Docker / Docker Compose
- Linux VPS
