from flask import Flask, render_template, send_from_directory
import radar as rd
from pyArango.connection import *
import configparser

app = Flask(__name__, static_url_path='')

@app.route('/home')
@app.route('/')
def home():
    return render_template('./index.html')

@app.route('/js/<path:path>')
def send_js(path):
    return send_from_directory('js', path)

@app.route('/data/<path:path>')
def send_data(path):
    return send_from_directory('data', path)

@app.route('/api/radar/<term>')
def radarrequest(term):
    res = {}
    location = [39.7047, -105.0814]
    kwparams = {}
    if term in search_types:
        print('Using type search [{}]'.format(term))
        kwparams['type'] = term
    else:
        kwparams['keyword'] = term
    res[term] = rd.radar(location, kwparams, db,
        radius=25000,
        key=config.get('keys', 'google_places_api_key'),
        upsample=50)
    return json.dumps(res)


if __name__ == '__main__':
    conn = Connection(username='galvbnk', password='')
    db   = conn['capstone']


    config = configparser.RawConfigParser()
    config.read('../secrets.conf')

    search_types = [term.strip() for term in open('../placetypes.txt').readlines()]
    app.run(host='0.0.0.0', port=1337, debug=True)
