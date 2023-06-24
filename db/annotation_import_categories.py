import mysql.connector
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("--host", type=str, required=True)
parser.add_argument("--port", type=str, required=True)
parser.add_argument("--user", type=str, required=True)
parser.add_argument("--password", type=str, required=True)
parser.add_argument(
    "--database",
    type=str,
    default="PartNetMobility",
    help="mysql database name [Default: PartNetMobility]",
)
args = parser.parse_args()

categories = [
    "Bottle",
    "Box",
    "Bucket",
    "Camera",
    "Cart",
    "Chair",
    "Clock",
    "CoffeeMachine",
    "Dishwasher",
    "Dispenser",
    "Display",
    "Door",
    "Eyeglasses",
    "Fan",
    "Faucet",
    "FoldingChair",
    "Globe",
    "Kettle",
    "Keyboard",
    "KitchenPot",
    "Knife",
    "Lamp",
    "Laptop",
    "Lighter",
    "Microwave",
    "Mouse",
    "Oven",
    "Pen",
    "Phone",
    "Pliers",
    "Printer",
    "Refrigerator",
    "Remote",
    "Safe",
    "Scissors",
    "Stapler",
    "StorageFurniture",
    "Suitcase",
    "Switch",
    "Table",
    "Toaster",
    "Toilet",
    "TrashCan",
    "USB",
    "WashingMachine",
    "Window",
]


mydb = mysql.connector.connect(
    host=args.host,
    port=args.port,
    user=args.user,
    passwd=args.password,
    database=args.database,
    auth_plugin="mysql_native_password",
)

mycursor = mydb.cursor()
sql = "INSERT INTO ShapeCategory (name) VALUES (%s)"

for cat in categories:
    mycursor.execute(sql, (cat,))
    mydb.commit()
    print("SUCCESS: inserting ", cat)
