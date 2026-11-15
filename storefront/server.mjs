
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, createReadStream } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createDatabase } from './postgres-db.mjs';

import { expandBag, selectionSnapshot, promotionTotals } from './dist/catalogue-model.js';
import { validateReview } from './dist/reviews-model.js';
import { createAccounts } from './account-auth.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const catalogue = JSON.parse(
  readFileSync(resolve(directory, 'dist/catalogue.json'), 'utf8')
);

const variants = new Set(
  catalogue.flatMap(p => p.options.map(o => `${p.sku}-${o}`))
);

const provinces = new Set([
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape'
]);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.mp4': 'video/mp4'
};

const defaults = {
  product: 'http://127.0.0.1:8080',
  order: 'http://127.0.0.1:8081',
  inventory: 'http://127.0.0.1:8082',
  payment: 'http://127.0.0.1:8083',
  delivery: 'http://127.0.0.1:8084'
};

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(data));
}

async function body(request) {
  const chunks = [];
  let length = 0;

  for await (const chunk of request) {
    length += chunk.length;

    if (length > 16384) {
      throw new HttpError(413, 'The request is too large.');
    }

    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Send a valid JSON checkout request.');
  }
}

export function validateCheckout(input) {
  const customer = input?.customer;

  if (!customer || typeof customer !== 'object') {
    throw new HttpError(400, 'Enter the demo customer details.');
  }

  const clean = {};

  for (const [field, max] of Object.entries({
    firstName: 60,
    lastName: 60,
    email: 120,
    address: 200,
    city: 80,
    postalCode: 4,
    province: 30
  })) {
    if (
      typeof customer[field] !== 'string' ||
      !customer[field].trim() ||
      customer[field].trim().length > max
    ) {
      throw new HttpError(
        400,
        `Enter a valid ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}.`
      );
    }

    clean[field] = customer[field].trim();
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email) ||
    !/^\d{4}$/.test(clean.postalCode) ||
    !provinces.has(clean.province)
  ) {
    throw new HttpError(400, 'Check the email, postal code and province.');
  }

  if (!['on', true].includes(customer.acknowledged)) {
    throw new HttpError(400, 'Please acknowledge the simulated checkout.');
  }

  if (input.selections !== undefined) {
    try {
      return {
        customer: clean,
        items: expandBag(catalogue, input.selections),
        selections: selectionSnapshot(catalogue, input.selections),
        designSelections: input.selections.map(
          ({ id, option, quantity }) => ({ id, option, quantity })
        )
      };
    } catch (error) {
      throw new HttpError(400, error.message);
    }
  }

  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > variants.size
  ) {
    throw new HttpError(400, 'Your bag must contain valid product options.');
  }

  const seen = new Set();

  const items = input.items.map(item => {
    if (
      !item ||
      !variants.has(item.productId) ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 10 ||
      seen.has(item.productId)
    ) {
      throw new HttpError(
        400,
        'Check the product options and quantities in your bag.'
      );
    }

    seen.add(item.productId);

    return {
      productId: item.productId,
      quantity: item.quantity
    };
  }).sort((a, b) => a.productId.localeCompare(b.productId));

  return { customer: clean, items };
}

export async function createStorefront(options = {}) {
  const root = resolve(
    options.staticDirectory || resolve(directory, 'dist')
  );

  // The public portfolio uses Supabase-only simulated orders; local Docker retains the ShopLink workflow.
  const demoMode = Boolean(process.env.VERCEL) && process.env.CHECKOUT_MODE !== 'integrated';
  const db = createDatabase();
  await db.ping();
  const accounts = createAccounts(db, {
    body,
    json,
    secureCookies: options.secureCookies ?? Boolean(process.env.VERCEL)
  });

  const services = Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [
      key,
      options.services?.[key] ||
      process.env[`${key.toUpperCase()}_SERVICE_URL`] ||
      value
    ])
  );

  const upstream = async (service, path, init = {}) => {
    let response;

    try {
      response = await fetch(new URL(path, services[service]), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...init.headers
        },
        signal: AbortSignal.timeout(8000)
      });
    } catch (error) {
      throw new HttpError(
        503,
        'The integrated services are unavailable. Please start ShopLink and try again.',
        error.name === 'TimeoutError'
          ? 'UPSTREAM_TIMEOUT'
          : 'UPSTREAM_UNAVAILABLE'
      );
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new HttpError(
        response.status,
        data?.detail ||
          data?.message ||
          data?.error ||
          (response.status === 409
            ? 'An item no longer has enough stock. Please adjust your bag.'
            : 'The service could not complete this request.'),
        'UPSTREAM_REJECTED'
      );
    }

    return data;
  };

  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'SAMEORIGIN');

    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "script-src 'self'; connect-src 'self'; base-uri 'self'; " +
      "form-action 'self'; frame-ancestors 'self'"
    );

    try {
      const url = new URL(request.url, 'http://localhost');

      if (url.pathname.startsWith('/api/')) {
        const host = request.headers.host;

        if (!host) {
          throw new HttpError(400, 'A host header is required.');
        }

        if (
          request.headers.origin &&
          new URL(request.headers.origin).host !== host
        ) {
          throw new HttpError(403, 'Cross-origin requests are not allowed.');
        }

        if (request.headers['sec-fetch-site'] === 'cross-site') {
          throw new HttpError(403, 'Cross-site requests are not allowed.');
        }

        if (await accounts.handle(request, response, url.pathname)) {
          return;
        }

        if (
          request.method === 'GET' &&
          url.pathname === '/api/account/orders'
        ) {
          const user = await accounts.requireUser(request);

          const orders = await db.prepare(`
            SELECT order_id, created_at, selection_snapshot
            FROM checkouts
            WHERE user_id=? AND state='accepted'
            ORDER BY created_at DESC
            LIMIT 50
          `).all(user.id);

          return json(response, 200, {
            orders: orders.map(row => ({
              id: row.order_id,
              createdAt: row.created_at,
              selections: row.selection_snapshot
                ? (typeof row.selection_snapshot==='string'?JSON.parse(row.selection_snapshot):row.selection_snapshot)
                : []
            }))
          });
        }

        let session = request.headers.cookie?.match(
          /(?:^|;\s*)hv_session=([a-f0-9]{64})(?:;|$)/
        )?.[1];

        if (!session) {
          session = randomBytes(32).toString('hex');

          response.setHeader(
            'Set-Cookie',
            `hv_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`
          );
        }

        if (
          url.pathname === '/api/reviews' ||
          url.pathname.startsWith('/api/reviews/')
        ) {
          const productId =
            url.pathname === '/api/reviews'
              ? null
              : decodeURIComponent(
                  url.pathname.slice('/api/reviews/'.length)
                );

          if (
            productId !== null &&
            !catalogue.some(p => p.id === productId && !p.hidden)
          ) {
            throw new HttpError(404, 'That design does not exist.');
          }

          if (request.method === 'GET') {
            const rows = productId === null
              ? await db.prepare(`
                  SELECT *
                  FROM reviews
                  ORDER BY created_at DESC, product_id, session
                  LIMIT 50
                `).all()
              : await db.prepare(`
                  SELECT *
                  FROM reviews
                  WHERE product_id=?
                  ORDER BY created_at DESC, session
                  LIMIT 50
                `).all(productId);

            const stats = productId === null
              ? await db.prepare(`
                  SELECT COUNT(*) AS total, AVG(rating) AS average
                  FROM reviews
                `).get()
              : await db.prepare(`
                  SELECT COUNT(*) AS total, AVG(rating) AS average
                  FROM reviews
                  WHERE product_id=?
                `).get(productId);

            const own = productId === null
              ? null
              : await db.prepare(`
                  SELECT name, rating, comment
                  FROM reviews
                  WHERE product_id=? AND session=?
                `).get(productId, session);

            return json(response, 200, {
              total: stats.total,
              average: stats.average === null
                ? null
                : Math.round(Number(stats.average) * 10) / 10,
              reviews: rows.map(row => ({
                productId: row.product_id,
                name: row.name,
                rating: row.rating,
                comment: row.comment,
                createdAt: row.created_at,
                mine: row.session === session
              })),
              ownReview: own || null
            });
          }

          if (productId !== null && request.method === 'POST') {
            const input = await body(request);
            let review;

            try {
              review = validateReview(input);
            } catch (error) {
              throw new HttpError(400, error.message);
            }

            await db.prepare(`
              INSERT INTO reviews(
                product_id, session, name, rating, comment, created_at
              )
              VALUES(?,?,?,?,?,?)
              ON CONFLICT(product_id, session)
              DO UPDATE SET
                name=excluded.name,
                rating=excluded.rating,
                comment=excluded.comment,
                created_at=excluded.created_at
            `).run(
              productId,
              session,
              review.name,
              review.rating,
              review.comment,
              new Date().toISOString()
            );

            return json(response, 200, {
              message: 'Your demo review has been saved.'
            });
          }

          if (productId !== null && request.method === 'DELETE') {
            await db.prepare(`
              DELETE FROM reviews
              WHERE product_id=? AND session=?
            `).run(productId, session);

            return json(response, 200, {
              message: 'Your review has been removed.'
            });
          }

          throw new HttpError(
            405,
            'Choose a design to save or remove a review.'
          );
        }

        if (
          request.method === 'GET' &&
          url.pathname === '/api/health'
        ) {
          if (demoMode) {
            return json(response, 200, { status: 'UP', mode: 'demo' });
          }
          await Promise.all(
            Object.keys(services).map(service =>
              upstream(service, '/actuator/health')
            )
          );

          return json(response, 200, {
            status: 'UP',
            mode: 'integrated'
          });
        }

        if (
          request.method === 'GET' &&
          url.pathname.startsWith('/api/inventory/')
        ) {
          const id = decodeURIComponent(
            url.pathname.slice('/api/inventory/'.length)
          );

          if (!variants.has(id)) {
            throw new HttpError(
              404,
              'That product option does not exist.'
            );
          }

          return json(
            response,
            200,
            await upstream(
              'inventory',
              `/inventory/${encodeURIComponent(id)}`
            )
          );
        }

        if (
          request.method === 'POST' &&
          url.pathname === '/api/orders'
        ) {
          const user = await accounts.requireUser(request);
          const owner = `user:${user.id}`;
          const key = request.headers['idempotency-key'];

          if (
            typeof key !== 'string' ||
            !/^[a-zA-Z0-9-]{16,100}$/.test(key)
          ) {
            throw new HttpError(
              400,
              'A valid checkout request reference is required.'
            );
          }

          const payload = await body(request);

          const input = validateCheckout({
            ...payload,
            customer: {
              ...payload?.customer,
              email: user.email
            }
          });

          const hash = createHash('sha256')
            .update(JSON.stringify(input))
            .digest('hex');

          const existing = await db.prepare(`
            SELECT *
            FROM checkouts
            WHERE session=? AND request_key=?
          `).get(owner, key);

          if (existing) {
            if (existing.payload_hash !== hash) {
              throw new HttpError(
                409,
                'This request reference belongs to different checkout details. Restore the original details to recover it.',
                'KEY_REUSED'
              );
            }

            if (existing.order_id) {
              const savedCustomer = typeof existing.customer === 'string'
                ? JSON.parse(existing.customer) : existing.customer;
              return json(response, 200, {
                order: savedCustomer?.demoOrder || await upstream(
                  'order',
                  `/orders/${encodeURIComponent(existing.order_id)}`
                )
              });
            }

            throw new HttpError(
              409,
              existing.state === 'pending'
                ? 'Your order is still being submitted. Please wait before checking again.'
                : 'The order service did not confirm the outcome. To prevent a duplicate order, this request will not be sent again. Check the local checkout journal before placing another order.',
              'OUTCOME_UNKNOWN'
            );
          }

          if (demoMode) {
            if (!Array.isArray(payload.selections)) {
              throw new HttpError(400, 'Select jewellery from your shopping bag.');
            }
            // All prices and discounts come from the trusted server catalogue.
            const pricing = promotionTotals(catalogue, payload.selections);
            const order = {
              id: `DEMO-${randomUUID()}`,
              status: 'PAID',
              subtotal: pricing.subtotal,
              discount: pricing.discount,
              total: pricing.total,
              items: input.selections.map(item => ({
                productName: item.name,
                unitPrice: item.price,
                quantity: item.quantity
              }))
            };
            const rowCount = await db.prepare(`
              INSERT INTO checkouts(
                session, request_key, payload_hash, state,
                order_id, customer, created_at,
                selection_snapshot, user_id
              ) VALUES(?,?,?,?,?,?,?,?,?)
              ON CONFLICT(session, request_key) DO NOTHING
            `).run(
              owner, key, hash, 'accepted', order.id,
              JSON.stringify({ ...input.customer, demoOrder: order }),
              new Date().toISOString(),
              JSON.stringify(input.selections), user.id
            );
            if (rowCount === 0) {
              // A simultaneous duplicate must never create another order.
              const prior = await db.prepare(`
                SELECT payload_hash, customer FROM checkouts
                WHERE session=? AND request_key=?
              `).get(owner, key);
              if (prior?.payload_hash !== hash) {
                throw new HttpError(409, 'That checkout reference was already used for another bag.', 'KEY_REUSED');
              }
              const saved = typeof prior.customer === 'string'
                ? JSON.parse(prior.customer) : prior.customer;
              if (!saved?.demoOrder) {
                throw new HttpError(409, 'This checkout request is already being processed.', 'OUTCOME_UNKNOWN');
              }
              return json(response, 200, { order: saved.demoOrder });
            }
            return json(response, 201, { order });
          }

          // Check backend services before submitting an order.
          await Promise.all(
            ['order', 'inventory', 'product', 'payment', 'delivery']
              .map(service => upstream(service, '/actuator/health'))
          );

          await db.prepare(`
            INSERT INTO checkouts(
              session, request_key, payload_hash, state,
              order_id, customer, created_at,
              selection_snapshot, user_id
            )
            VALUES(?,?,?,?,?,?,?,?,?)
          `).run(
            owner,
            key,
            hash,
            'pending',
            null,
            JSON.stringify(input.customer),
            new Date().toISOString(),
            input.selections
              ? JSON.stringify(input.selections)
              : null,
            user.id
          );

          try {
            const order = await upstream('order', '/orders', {
              method: 'POST',
              body: JSON.stringify({
                customerId: `USER-${user.id}`,
                items: input.items,
                selections: input.designSelections
              })
            });

            await db.prepare(`
              UPDATE checkouts
              SET state='accepted', order_id=?
              WHERE session=? AND request_key=?
            `).run(order.id, owner, key);

            return json(response, 201, { order });
          } catch (error) {
            if (
              error.code === 'UPSTREAM_REJECTED' &&
              error.status >= 400 &&
              error.status < 500
            ) {
              await db.prepare(`
                DELETE FROM checkouts
                WHERE session=? AND request_key=?
              `).run(owner, key);

              throw error;
            }

            await db.prepare(`
              UPDATE checkouts
              SET state='unknown'
              WHERE session=? AND request_key=?
            `).run(owner, key);

            throw new HttpError(
              503,
              'We could not confirm whether the order was accepted. Keep this bag unchanged and retry to recover the request; it will not be submitted twice.',
              'OUTCOME_UNKNOWN'
            );
          }
        }

        if (
          request.method === 'GET' &&
          /^\/api\/orders\/[a-zA-Z0-9-]{1,100}$/.test(url.pathname)
        ) {
          const user = await accounts.requireUser(request);
          const id = url.pathname.slice('/api/orders/'.length);

          const receipt = await db.prepare(`
            SELECT customer, selection_snapshot
            FROM checkouts
            WHERE user_id=? AND order_id=?
          `).get(user.id, id);

          if (!receipt) {
            throw new HttpError(
              404,
              'No order with this reference belongs to your account.'
            );
          }

          const savedCustomer = typeof receipt.customer === 'string'
            ? JSON.parse(receipt.customer) : receipt.customer;
          if (savedCustomer?.demoOrder) {
            const order = savedCustomer.demoOrder;
            return json(response, 200, {
              order,
              delivery: {
                deliveryId: `SIM-${order.id}`,
                status: 'SIMULATED'
              },
              receipt: {
                city: savedCustomer.city,
                province: savedCustomer.province,
                selections: typeof receipt.selection_snapshot === 'string'
                  ? JSON.parse(receipt.selection_snapshot)
                  : (receipt.selection_snapshot || [])
              }
            });
          }

          let order;

          try {
            order = await upstream(
              'order',
              `/orders/${encodeURIComponent(id)}`
            );
          } catch (error) {
            if (error.status === 404) {
              throw new HttpError(
                404,
                'This order is no longer available. The demo services may have been reset.'
              );
            }

            throw error;
          }

          let delivery = null;

          if (order.status === 'PAID') {
            try {
              delivery = await upstream(
                'delivery',
                `/deliveries/orders/${encodeURIComponent(id)}`
              );
            } catch (error) {
              if (error.status !== 404) {
                throw error;
              }
            }
          }

          const customer = (typeof receipt.customer==='string'?JSON.parse(receipt.customer):receipt.customer);

          return json(response, 200, {
            order,
            delivery,
            receipt: {
              city: customer.city,
              province: customer.province,
              selections: receipt.selection_snapshot
                ? (typeof receipt.selection_snapshot==='string'?JSON.parse(receipt.selection_snapshot):receipt.selection_snapshot)
                : null
            }
          });
        }

        throw new HttpError(
          404,
          'That API route does not exist.'
        );
      }

      // Serve storefront pages and assets.
      if (!['GET', 'HEAD'].includes(request.method)) {
        throw new HttpError(
          405,
          'This page only supports GET and HEAD.'
        );
      }

      const pathname = decodeURIComponent(url.pathname);

      if (
        pathname.includes('\0') ||
        pathname.split(/[\\\/]/).some(
          part => part.startsWith('.') && part !== ''
        )
      ) {
        throw new HttpError(404, 'Page not found.');
      }

      const path = resolve(
        root,
        pathname === '/' ? 'index.html' : `.${pathname}`
      );

      if (!path.startsWith(root + sep)) {
        throw new HttpError(404, 'Page not found.');
      }

      const info = await stat(path).catch(() => null);

      if (!info?.isFile()) {
        throw new HttpError(404, 'Page not found.');
      }

      if (extname(path) === '.mp4') {
        const headers = {
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600'
        };

        let start = 0;
        let end = info.size - 1;
        let partial = false;

        if (request.headers.range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(
            request.headers.range
          );

          if (!match || (!match[1] && !match[2])) {
            response.writeHead(416, {
              ...headers,
              'Content-Range': `bytes */${info.size}`
            });
            response.end();
            return;
          }

          if (!match[1]) {
            start = Math.max(0, info.size - Number(match[2]));
          } else {
            start = Number(match[1]);

            if (match[2]) {
              end = Math.min(end, Number(match[2]));
            }
          }

          if (
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            start > end ||
            start >= info.size
          ) {
            response.writeHead(416, {
              ...headers,
              'Content-Range': `bytes */${info.size}`
            });
            response.end();
            return;
          }

          partial = true;
        }

        response.writeHead(partial ? 206 : 200, {
          ...headers,
          'Content-Length': end - start + 1,
          ...(partial
            ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` }
            : {})
        });

        if (request.method === 'HEAD') {
          response.end();
          return;
        }

        const stream = createReadStream(path, { start, end });

        stream.on('error', () => response.destroy());
        response.on('close', () => stream.destroy());
        stream.pipe(response);
        return;
      }

      response.writeHead(200, {
        'Content-Type':
          mime[extname(path)] || 'application/octet-stream',
        'Cache-Control': path.includes(`${sep}assets${sep}`)
          ? 'public, max-age=3600'
          : 'no-cache'
      });

      response.end(
        request.method === 'HEAD'
          ? undefined
          : await readFile(path)
      );
    } catch (error) {
      if (!response.headersSent) {
        json(response, error.status || 500, {
          message: error.status
            ? error.message
            : 'Something went wrong. Please try again.',
          code: error.code
        });
      } else {
        response.end();
      }
    }
  });

  server.on('close', () => { void db.close(); });

  server.requestTimeout = 20000;
  server.headersTimeout = 10000;

  return server;
}

// VERCEL DEPLOYMENT FIX
// Export the HTTP server so Vercel can handle incoming requests.
// SQLite files on Vercel use temporary storage only.

const server = await createStorefront();

export default server;

// LOCAL DEVELOPMENT
// Continue supporting normal Node.js startup.

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);

  server.listen(port, host, () => {
    console.log(
      `The Heirloom Verse is ready at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`
    );
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () =>
      server.close(() => process.exit(0))
    );
  }
}
