# NewsHub

NewsHub is now organized into two clear parts:

- `frontend/`: the Angular application
- `backend/`: the Python API and database setup

## Reprendre le projet

Si tu pars de zero, demarre d'abord la base MySQL et l'API Python, puis lance le front Angular.

1. Cree la base `NewsHub` avec le script `backend/init_db.sql`.
2. Installe les dependances Python depuis `backend` avec `pip install -r requirements.txt`.
3. Lance l'API depuis `backend` avec `uvicorn main:app --reload`.
4. Va dans `frontend`, puis installe les dependances avec `npm install`.
5. Depuis `frontend`, lance le front avec `npm start`.

Si tu avais deja cree une ancienne base, recree-la avec le script SQL, parce que la table `users` stocke maintenant un `password_hash`.

Le front utilise l'API Python sur `http://127.0.0.1:8000` pour l'inscription, la connexion et les interets.
Les articles de news viennent de l'API NewsData externe, donc ils peuvent s'afficher meme si ta base est vide.

## Frontend

Depuis `frontend` :

```bash
npm install
npm start
```

Le serveur Angular demarre sur `http://localhost:4200/`.

### Commandes utiles

```bash
ng serve
ng build
ng test
```

## Backend

Depuis `backend` :

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

L'API tourne sur `http://127.0.0.1:8000/`.

## Chatbot Qwen3

Le chatbot depend d'un serveur Ollama local. Pour que le chat general fonctionne de facon fiable :

1. Demarre Ollama sur la machine.
2. Assure-toi que l'API locale repond sur `http://127.0.0.1:11434`.
3. Installe au minimum ces modeles dans Ollama :
   - `qwen3:14b`
   - `nomic-embed-text`
4. Ouvre la page d'un article premium et verifie la carte d'etat du chatbot.

Le backend essaye maintenant automatiquement :

- le modele prefere `qwen3:14b`
- une autre variante `qwen3` si elle est deja installee
- le modele d'embedding configure pour la recherche d'extraits

Variables d'environnement utiles :

- `OLLAMA_HOST` pour changer l'URL du serveur Ollama
- `OLLAMA_MODEL` pour changer le modele Qwen3 prefere
- `OLLAMA_EMBED_MODEL` pour changer le modele d'embedding

Endpoint utile :

- `GET /chatbot/status` retourne l'etat de connexion Ollama, le modele actif et les problemes detectes
