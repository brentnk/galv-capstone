from flask import Flask, render_template, send_from_directory
import radar as rd
from pyArango.connection import *
import configparser
from elasticsearch import Elasticsearch

app = Flask(__name__, static_url_path='')

@app.route('/home')
@app.route('/')
def home():
    return send_from_directory('templates', 'index.html')

@app.route('/hexbin')
def hx():
    return render_template('./hexbin_test.html')

@app.route('/bower/<path:path>')
def send_bower(path):
    return send_from_directory('bower_components',path)

@app.route('/js/<path:path>')
def send_js(path):
    return send_from_directory('js', path)

@app.route('/css/<path:path>')
def send_css(path):
    return send_from_directory('css', path)

@app.route('/data/<path:path>')
def send_data(path):
    return send_from_directory('data', path)

@app.route('/api/radar/<terms>')
def radarrequest(terms):
    res = { 'terms': [] }
    location = [39.7047, -105.0814]
    kwparams = {}
    print('Serving terms {}'.format(terms))
    split_terms = terms.split(';')[:15]
    for t in split_terms:
        t = t.strip()
        if t in search_types:
            print('Using type search [{}]'.format(t))
            kwparams['type'] = t
        else:
            kwparams['keyword'] = t
        res[t] = rd.radar(location, kwparams, escon,
            radius=25000,
            key=config.get('keys', 'google_places_api_key'),
            upsample=720)
        res['terms'].append(t)
    return json.dumps(res)

def load_google_placetypes(path):
    return [term.strip() for term in open(path).readlines()]

if __name__ == '__main__':
    config = configparser.RawConfigParser()
    config.read('../application.conf')

    escon = Elasticsearch(host=config.get('db.es', 'host'),
                          port=config.getint('db.es', 'port'))

    host = config.get('app', 'host')
    port = config.getint('app', 'port')
    debug = config.getboolean('app', 'debug')

    search_types = load_google_placetypes('../placetypes.txt')
    app.run(host=host, port=port, debug=debug)
