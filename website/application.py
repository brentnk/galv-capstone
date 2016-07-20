from flask import Flask, render_template, send_from_directory
import radar as rd
from pyArango.connection import *
import configparser

app = Flask(__name__, static_url_path='')

@app.route('/home')
@app.route('/')
def home():
    return render_template('./index.html')

@app.route('/bower/<path:path>')
def send_bower(path):
    return send_from_directory('bower_components',path)

@app.route('/js/<path:path>')
def send_js(path):
    return send_from_directory('js', path)

@app.route('/data/<path:path>')
def send_data(path):
    return send_from_directory('data', path)

@app.route('/api/radar/<terms>')
def radarrequest(terms):
    res = { 'terms': [] }
    location = [39.7047, -105.0814]
    kwparams = {}
    print('Serving terms {}'.format(terms))
    for t in terms.split(';'):
        t = t.strip()
        if t in search_types:
            print('Using type search [{}]'.format(t))
            kwparams['type'] = t
        else:
            kwparams['keyword'] = t
        res[t] = rd.radar(location, kwparams, db,
            radius=25000,
            key=config.get('keys', 'google_places_api_key'),
            upsample=5)
        res['terms'].append(t)
    return json.dumps(res)


if __name__ == '__main__':
    config = configparser.RawConfigParser()
    config.read('../secrets.conf')

    conn = Connection(username=config.get('db', 'username'),
                      password=config.get('db', 'password'))
    db   = conn['capstone']

    search_types = [term.strip() for term in open('../placetypes.txt').readlines()]
    app.run(host='0.0.0.0', port=1337, debug=True)
