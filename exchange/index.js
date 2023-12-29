import { WebSocket, WebSocketServer } from "ws";
import fetch from "node-fetch"; // Importing node-fetch
import axios from "axios";
import { v4 as uuid } from "uuid";

const instrumentTick = 30; // 30 minutes

let current_instrument = {};

let pnls = {};

let exchange = {
  buy_orders: {},
  sell_orders: {},
  trades: [],
  positions: {},
};

// Function to fetch weather data and log the apparent temperature
async function fetchApparentTemperature() {
  const url = "https://api.weather.bom.gov.au/v1/locations/r3gwbq/observations";

  try {
    console.log("Making fetch request...");
    const response = await axios.get(url);

    console.log("Fetch completed, processing response...");

    if (response.status === 200) {
      const data = response.data; // In Axios, the data is under the 'data' property
      return new Number(data.data.temp_feels_like);
    } else {
      console.log("Response not ok:", response.status);
    }
  } catch (error) {
    console.error("Error during fetch or processing:", error);
  }
}

function complete_instrument() {
  console.log("Completed instrument!");
  fetchApparentTemperature().then((apparentTemp) => {
    settle_exchange(apparentTemp);
    broadcastUpdate(pnls, "instrument_closed");
    create_instrument();
  });
}

function create_instrument() {
  var next = new Date();
  next.setMinutes(
    Math.ceil(next.getMinutes() / instrumentTick) * instrumentTick
  );
  next.setSeconds(0);

  current_instrument.expiry = next.getTime() / 1000;
  current_instrument.name =
    next.getUTCDay() + ":" + next.getUTCHours() + ":" + next.getUTCMinutes();

  let waitTime = next.getTime() - new Date().getTime();
  waitTime = waitTime > 0 ? waitTime : 1000 * 60 * instrumentTick; // Ensure a minimum 30-minute wait time
  console.log("Waiting for:", waitTime, "milliseconds.");
  setTimeout(complete_instrument, waitTime);

  // Broadcast to users
  broadcastUpdate(current_instrument, "new_instrument");
}

function settle_exchange(settlement_price) {
  console.log("Settling @", settlement_price);
  Object.entries(exchange.positions).forEach(([id, pos]) => {
    let pnl = 0;
    pos.trades.forEach((t) => {
      if (t.buyer == id) pnl += (settlement_price - t.price) * t.size;
      if (t.seller == id) pnl += (t.price - settlement_price) * t.size;
    });
    if (!pnls[id])
      pnls[id] = {
        total_pnl: 0,
        [current_instrument.name]: pnl,
        settlement_price,
      };
    else pnls[id][current_instrument.name] = pnl;

    pnls[id].total_pnl += pnl;
  });

  reset_exchange();
}

function reset_exchange() {
  exchange.buy_orders = {};
  exchange.sell_orders = {};
  exchange.trades = [];
  exchange.positions = {};
}

function broadcastUpdate(data, type) {
  const message = JSON.stringify({ type, data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function addOrderToBook(order) {
  const book =
    order.direction === "BUY" ? exchange.buy_orders : exchange.sell_orders;
  order.id = uuid(); // Generate ID
  order.timestamp = new Date().getTime(); // Generate timestamp
  if (order.price in book) book[order.price].push(order);
  else book[order.price] = [order];
  return order;
}

function matchOrder(order, book) {
  const priceLevels = Object.keys(book);
  if (order.direction === "BUY") priceLevels.sort((a, b) => a - b);
  else priceLevels.sort((a, b) => b - a);

  for (let i = 0; i < priceLevels.length; i++) {
    const price = priceLevels[i];
    const orders = book[price];
    for (let j = 0; j < orders.length; j++) {
      const crossOrder = orders[j];
      if (
        (order.direction === "BUY" && crossOrder.price <= order.price) ||
        (order.direction === "SELL" && crossOrder.price >= order.price)
      ) {
        return crossOrder;
      }
    }
  }
}

function updatePositions(trade) {
  [trade.buyer, trade.seller].forEach((trader) => {
    if (!exchange.positions[trader]) {
      exchange.positions[trader] = { trades: [], position: 0 };
    }
  });

  exchange.positions[trade.seller].trades.push(trade);
  exchange.positions[trade.seller].position -= trade.size;

  exchange.positions[trade.buyer].trades.push(trade);
  exchange.positions[trade.buyer].position += trade.size;

  exchange.trades.push(trade);
}

function executeOrder(crossOrder, order) {
  const traded_vol = Math.min(crossOrder.size, order.size);
  order.size -= traded_vol;
  crossOrder.size -= traded_vol;

  // Create and broadcast the trade
  const trade = {
    seller: crossOrder.direction === "SELL" ? crossOrder.sender : order.sender,
    buyer: crossOrder.direction === "BUY" ? crossOrder.sender : order.sender,
    buy_order_id: order.direction === "BUY" ? order.id : crossOrder.id,
    sell_order_id: order.direction === "SELL" ? order.id : crossOrder.id,
    size: traded_vol,
    price: crossOrder.price,
    id: uuid(),
    timestamp: new Date().getTime(),
  };
  updatePositions(trade);

  // Remove or update fully executed orders
  if (crossOrder.size === 0) {
    removeOrderFromBook(crossOrder);
  }

  return trade;
}

function removeOrderFromBook(order) {
  const book =
    order.direction === "SELL" ? exchange.sell_orders : exchange.buy_orders;
  if (order.price in book) {
    const order_to_remove = book[order.price].find(
      (o) => o.sender === order.sender && o.id === order.id
    );

    if (order_to_remove) {
      book[order.price] = book[order.price].filter(
        (o) => o.id !== order_to_remove.id
      );
      broadcastUpdate([order_to_remove], "removed_orders");
    }
  }
}

function checkTrades(order) {
  let book =
    order.direction === "BUY" ? exchange.sell_orders : exchange.buy_orders;

  const trades = [];

  while (order.size > 0) {
    let crossOrder = matchOrder(order, book);
    if (!crossOrder) break; // No matching order found

    const trade = executeOrder(crossOrder, order);
    trades.push(trade);

    // Remove fully executed orders
    if (order.size === 0) {
      removeOrderFromBook(order);
    }
  }

  if (order.size > 0) {
    // If order wasn't fully matched, add to book
    const orderConfirmation = addOrderToBook(order);
    return [orderConfirmation, trades];
  }
  return [null, trades];
}

function processOrder(ws, order) {
  // Round order price to 0.1
  order.price = Math.round(order.price * 10) / 10;
  const [resultingOrder, trades] = checkTrades(order);
  if (resultingOrder) {
    broadcastUpdate(resultingOrder, "order_confirmation");
  }

  broadcastUpdate(trades, "trades");
}

function clearOrders(ws, user_id) {
  // Find orders we will clear
  const orders_to_clear = [];
  Object.entries(exchange.buy_orders).forEach(([price, orders]) => {
    orders.forEach((o) => {
      if (o.sender === user_id) orders_to_clear.push(o);
    });
  });
  Object.entries(exchange.sell_orders).forEach(([price, orders]) => {
    orders.forEach((o) => {
      if (o.sender === user_id) orders_to_clear.push(o);
    });
  });

  Object.entries(exchange.buy_orders).forEach(([price, orders]) => {
    exchange.buy_orders[price] = orders.filter((o) => o.sender !== user_id);
  });
  Object.entries(exchange.sell_orders).forEach(([price, orders]) => {
    exchange.sell_orders[price] = orders.filter((o) => o.sender !== user_id);
  });

  return orders_to_clear;
}

const HOSTNAME = "0.0.0.0";
const PORT = 8081;
const wss = new WebSocketServer({ host: HOSTNAME, port: PORT });
create_instrument();

wss.on("connection", (ws) => {
  ws.send(
    JSON.stringify({
      type: "initial_state",
      exchange,
      pnls,
      current_instrument,
    })
  );

  ws.on("message", (message) => {
    // console.log("received: %s", message);
    const msg = JSON.parse(message);
    if (msg.type == "order") {
      processOrder(ws, msg.order);
    } else if (msg.type == "clear_orders") {
      const cleared_orders = clearOrders(ws, msg.sender);
      broadcastUpdate(cleared_orders, "removed_orders");
    } else if (msg.type == "get_pnls") {
      ws.send(JSON.stringify({ type: "pnls", pnls }));
    } else if (msg.type == "get_trades") {
      ws.send(JSON.stringify({ type: "all_trades", trades: exchange.trades }));
    } else if (msg.type == "remove_order") {
      removeOrderFromBook(msg.order);
    }
  });
});

console.log("WebSocket server started on ws://0.0.0.0:8081");
