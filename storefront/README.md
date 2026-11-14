# The Heirloom Verse Storefront

This folder contains the jewellery website, its product catalogue and the Node server that handles accounts, reviews, bags and simulated checkout.

## Run with the full system

From the repository root:

```powershell
docker compose up --build -d --wait --wait-timeout 240
```

Open [http://localhost:3000](http://localhost:3000).

The full Docker setup is required for live stock, customer accounts, reviews, checkout, payment simulation and delivery tracking.

## Run the storefront only

Node 22.13 or later is required. The storefront has no external npm packages.

```powershell
cd storefront
npm start
```

This is suitable for browsing the catalogue only. Checkout and live stock need the Java services running.

## Features

- Jewellery catalogues for rings, earrings, necklaces, bracelets and coordinated sets.
- Size, material, gemstone, category and price choices where available.
- Customer registration, sign-in, sign-out and account order history.
- Browser shopping bag and a simulated checkout.
- A 20% collection offer when the bag contains two different eligible designs.
- Visitor reviews and Help information.

## Demo boundaries

All products, customer details, reviews, contact details and payments are fictional. Do not enter real personal or payment information. The project is not a production store.

## Check the code

```powershell
npm run check
```
