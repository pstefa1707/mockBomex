# What is this?
The idea of building this exchange and example client is to provide a base to test trading strategies and ideas in a simulated environment.

This was totally speed-ran and so the code will be super shotty and likely buggy. I'll try to fix bugs as they come up, but I'm not going to be actively maintaining this. Just put on git so I can easily share it with people and clone to my deployment.

# Client Overview
The client is a simulated trading platform that connects to the exchange and sends orders to the exchange. It also receives updates from the exchange and you can choose how to handle these updates.

Note: your "trading-id" can be anything you want, but it must be unique. If you run multiple clients with the same trading-id, it'll cause bugs in the exchange.

## Example
To make a client you inherit from the `ExchangeClient` provided in `auto-trader/exchange_client.py`.
An example client which trades as per a random walk is provided in `auto-trader/example.py`.

## How to run
To run the example client, run:
- `cd client`
- `python example.py <trading_id> <exchange_host>`

# Exchange Overview
The exchange is a simulated trading platform running a market system for weather-based instruments. It periodically fetches weather data and uses it to settle markets. Profit and loss (P&L) are updated only when markets are settled.

The exchange trades apparent temperature futures, which are contracts that pay out based on the apparent temperature at a specified time. 
The apparent temperature is the temperature that it feels like outside, which is different from the actual temperature due to wind chill and heat index. 

The location we trade is Sydney Airport, and the weather data is fetched from the Bureau of Meteorology's API:
http://www.bom.gov.au/products/IDN60801/IDN60801.94767.shtml

## Features
### Weather Updates: 
The exchange provides future weather updates at regular intervals, creating new instruments reflecting these updates.
### Market Settlements: 
P&Ls are updated when markets are settled, based on the actual weather at the time of settlement.
### Dynamic Instrument Naming: 
New markets are named based on the date and time of their creation and settlement times.
Instrument name is `UTC_DAY:UTC_HOURS:UTC_MINUTES`` for when the future expires.
### Order Matching: 
The system matches buy and sell orders, executes trades, and updates positions accordingly.

## Functions
- fetchApparentTemperature(): Fetches weather data from a specified API and returns the apparent temperature.
- complete_instrument(): Settles the current instrument, calculates PNLs, and creates a new instrument.
- create_instrument(): Sets up a new market with a unique name and expiration time.
- settle_exchange(): Settles the exchange by calculating the final PNLs for all positions.
- broadcastUpdate(): Broadcasts updates to all connected clients.
- addOrderToBook(), matchOrder(), updatePositions(), executeOrder(), removeOrderFromBook(), checkTrades(): Functions for managing the order book and executing trades.

## Starting the Server
To start the WebSocket server and the trading system, run:
- `cd exchange`
- `npm install`
- `npm run start`