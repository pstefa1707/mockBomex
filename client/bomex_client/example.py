from typing import List, Optional
import websocket
import json
import random
import time
from threading import Thread
from sys import argv
from exchange_client import ExchangeClient, Order, Trade, Direction, Instrument

# Configuration for the auto-trader
max_price = 30
min_price = 20
max_size = 10

class RandomWalkStrategy(ExchangeClient):
    def __init__(self, *args):
        super().__init__(*args)
        self.current_price = 25 # initial starting price for random walk
  
    def on_order_confirmation(self, order: Order):
        print(f"Order confirmed: {order}")
    
    def on_trade(self, trade: Trade):
        print(f"Trade: {trade}")
        if trade.buyer == self.id:
            self.current_price += 0.5
        else:
            self.current_price -= 0.5
        
    def on_pnls(self, pnls):
        print(f"PNLs: {pnls}")
        
    def on_all_trades(self, trades: List[Trade]):
        print(f"ALL TRADES: {trades}")
        
    def on_new_instrument(self, instrument: Instrument):
        print(f"New instrument: {instrument}")
        
    def generate_order(self) -> Order:
        direction = random.choice([Direction.BUY, Direction.SELL])
        probability = ((((self.current_price - min_price) / (max_price - min_price)) - .5) / 2) + .5
        
        if random.random() < probability:
            self.current_price -= 1
        else:
            self.current_price += 1
        
        if self.current_price > max_price:
            self.current_price = max_price
        elif self.current_price < min_price:
            self.current_price = min_price
            
        # Trade with spread
        price = self.current_price + (-0.5 if direction == Direction.BUY else 0.5)
        # Random sizing
        size = random.randint(1, max_size)
        return Order(direction=direction, price=price, size=size)
    
if __name__ == '__main__':
    if len(argv) < 3:
        print("Please provide an ID and host, correct usage: python example.py <id> <hostname>:<port>")
        exit(1)
    else:
        ID = argv[1]
        HOSTNAME = argv[2]
        
    print(HOSTNAME)
    client = RandomWalkStrategy(HOSTNAME, ID)
    client.start()
    
    t = 0
    
    while True:
        t += 1
        order = client.generate_order()
        client.send_order(order)
        time.sleep(1)
        
        # Every 5 seconds request to see pnls
        if t % 5 == 0:
            client.request_pnls()