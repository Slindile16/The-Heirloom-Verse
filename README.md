# The Heirloom Verse

The Heirloom Verse is a fictional online jewellery store built on ShopLink. It includes rings, earrings, necklaces, bracelets and jewellery sets, along with customer accounts, a shopping bag, reviews, help details and a simulated checkout.

## Run the store locally

Install Docker Desktop with Linux containers and Docker Compose v2. From this folder, run:

```powershell
docker compose up --build -d --wait --wait-timeout 240
```

Then open [http://localhost:3000](http://localhost:3000).

To stop the local store:

```powershell
docker compose down
```

## What visitors can do

- Create an account or sign in before entering the shop.
- Browse jewellery by category, filter designs and add items to the bag.
- Build a qualifying collection from two different eligible designs to receive 20% off those eligible items.
- Read and leave visitor reviews.
- Use Help to find the demo contact details and order guidance.
- Place a simulated order and view it from My Account.

## Important demo notes

- This is a portfolio demo. Products, prices, reviews, addresses and payments are fictional.
- Payments are simulated. Do not enter real payment or personal details.
- The store needs the complete Docker stack for registration, reviews, checkout and order tracking.
- All local service ports are bound to your computer only. A public static preview can show the catalogue, but cannot provide the live account and checkout features.

## Project structure

- `storefront/` — the jewellery website and its server.
- `product-service/`, `inventory-service/`, `order-service/`, `payment-service/`, `delivery-service/`, `notification-service/` — the supporting Java services.
- `docker-compose.yml` — starts the complete local experience.
- `render.yaml` — configuration for a lightweight public catalogue preview.

## Basic check

```powershell
npm --prefix storefront run check
```

Each folder has a README where it needs one.
