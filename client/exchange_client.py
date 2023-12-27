from typing import Optional, List
import websocket
import json
import random
import time
from threading import Thread
from sys import argv
import datetime


from dataclasses import dataclass, asdict

class Direction:
    BUY = 'BUY'
    SELL = 'SELL'

@dataclass
class Order:
    id: Optional[str]
    direction: str
    price: float
    size: int
    sender: Optional[str]
    timestamp: Optional[int]
    
    def __init__(self, direction: str, price: float, size: int, id: Optional[str] = None, sender: Optional[str] = None, timestamp: Optional[int] = None):
        self.id = id
        self.direction = direction
        self.price = price
        self.size = size
        self.sender = sender
        self.timestamp = timestamp
    
@dataclass
class Trade:
    id : str
    buyer: str
    seller: str
    price: float
    size: int
    timestamp: int
  
@dataclass  
class Instrument:
    name: str
    expiry: datetime.datetime

class ExchangeClient():
    current_instrument: Optional[Instrument]
    
    def __init__(self, ws_url: str, id: str):
        assert (ws_url is not None and id is not None)
        super().__init__()
        self.ws_url = ws_url
        self.id = id
        self.ws = websocket.WebSocketApp("ws://" + ws_url,
                                         on_message=self.on_message,
                                         on_error=self.on_error,
                                         on_close=self.on_close)
        self.ws.on_open = self.on_open
        self.thread = Thread(target=self.ws.run_forever, daemon=True)
        self.current_instrument = None

    def start(self):
        self.thread.start()
        time.sleep(1) # Sleep for a sec to wait for thread to start
        
    def stop(self):
        self.ws.close()
        
    def _trade_handler(self, trade : dict):
        if trade['buyer'] == self.id or trade['seller'] == self.id:
            trade_obj = Trade(**trade)
            self.on_trade(trade_obj)

    def _order_confirmation_handler(self, orders : dict):
        order_obj = Order(**orders)
        self.on_order_confirmation(order_obj)
        
    def _new_instrument_handler(self, instrument : dict):
        expiry_date = datetime.datetime.utcfromtimestamp(instrument['expiry'])
        self.current_instrument = Instrument(instrument['name'], expiry_date)
        self.on_new_instrument(self.current_instrument)
        
    def on_new_instrument(self, instrument : Instrument):
        pass
        
    def on_trade(self, trade : Trade):
        pass
    
    def on_order_confirmation(self, order : Order):
        pass
    
    def on_orders(self, sell_orders : dict[Order], buy_orders : dict[Order]):
        pass
    
    def on_all_trades(self, trades : List[Trade]):
        pass
    
    def on_pnls(self, pnls : dict):
        pass
    
    def request_pnls(self):
        self.ws.send(json.dumps({"type": "get_pnls"}))
    
    def request_all_trades(self):
        self.ws.send(json.dumps({"type": "get_trades"}))
    
    def send_order(self, order : Order):
        order.sender = self.id
        self.ws.send(json.dumps({'type': 'order', 'order': asdict(order)}))
        
    def remove_order(self, order : Order):
        self.ws.send(json.dumps({'type': 'remove_order', 'order': asdict(order)}))

    def on_message(self, ws, message):
        msg = json.loads(message)
        if msg['type'] == 'new_instrument':
            self._new_instrument_handler(msg['data'])
        elif msg['type'] == 'instrument_closed':
            self.current_instrument = None
        elif msg['type'] == 'initial_state':
            self._new_instrument_handler(msg['current_instrument'])
        elif msg['type'] == 'trade':
            self._trade_handler(msg['data'])
        elif msg['type'] == 'all_trades':
            self.on_all_trades(list(map(lambda x: Trade(**x), msg['trades'])))
        elif msg['type'] == 'pnls':
            self.on_pnls(msg['pnls'])
        elif msg['type'] == 'order_confirmation':
            self.on_order_confirmation(Order(**msg['order']))
        elif msg['type'] == 'orders':
            # Deserialise the orders
            sell_orders = msg['data']['sell_orders']
            buy_orders = msg['data']['buy_orders']
            
            for price, orders in list(sell_orders.items()):
                sell_orders[float(price)] = list(map(lambda x: Order(**x), orders))
                del sell_orders[price]
                
            for price, orders in list(buy_orders.items()):
                buy_orders[float(price)] = list(map(lambda x: Order(**x), orders))
                del buy_orders[price]
                
            self.on_orders(sell_orders, buy_orders)

    def on_error(self, ws, error):
        print("Error:", error)

    def on_close(self, ws, close_status_code, close_msg):
        print("### closed ###")

    def on_open(self, ws):
        print("Connected to exchange")