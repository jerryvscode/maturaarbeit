// NPM Packete

require("dotenv").config()
const fork = require('child_process').fork
const multer = require("multer")
const jwt = require("jsonwebtoken")
const marked = require("marked")
const sanitizeHTML = require("sanitize-html")
const bcrypt = require("bcrypt")
const cookieParser = require("cookie-parser")
const express = require("express")
const db = require("better-sqlite3")("ourApp.db")
const ejs = require("ejs")
db.pragma("journal_mode = WAL")




// SQLite Setup

const createTables = db.transaction(() => {
  // Benutzertabelle erstellen
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email STRING NOT NULL,
    username STRING NOT NULL UNIQUE,
    password STRING NOT NULL
    )
    `
  ).run()

  // Artikeltabelle erstellen
  db.prepare(`
    CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    createdDate TEXT,
    title STRING NOT NULL,
    article TEXT NOT NULL,
    likes INTEGER,
    authorid INTEGER,
    FOREIGN KEY (authorid) REFERENCES users (id)
    )
  `).run()

  //Artikelwunschtabelle erstellen
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS articlewishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email STRING,
    articlewish STRING NOT NULL
    )
    `
  ).run()

  // Schreibertabelle erstellen
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS writers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    writer STRING NOT NULL
    )
    `
  ).run()

  // Sicherungstabelle für den echten und sichtbaren Namen des Admins erstellen
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS adminVisualName (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    adminVisualName STRING NOT NULL
    )
    `
  ).run()

  // Für jeden Benutzer automatisch eine Tabelle erstellen
  const usersStatement = db.prepare("SELECT username FROM users ORDER BY id ASC")
  const users = usersStatement.all()

  users.forEach(users => {
    db.prepare(
    `
    CREATE TABLE IF NOT EXISTS ${users.username} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    likedArticles STRING NOT NULL
    )
    `
    ).run()
  })
})

createTables()



// NPM Packete initialisieren


const app = express()

app.set("view engine", "ejs")
app.use(express.urlencoded({extended: false}))
app.use(express.static("public"))
app.use(express.static("pictures"))
app.use(cookieParser())

// Middleware

app.use(function (req, res, next) {
  // Markdownfunktion einrichten
  res.locals.filterUserHTML = function (content) {
    return sanitizeHTML(marked.parse(content), {
      allowedTags: ["p", "br", "ul", "li", "ol", "strong", "bold", "i", "em", "h1", "h2", "h3", "h4", "h5", "h6"],
      allowedAttributes: {}
    })
  }

  // Cookie überprüfen
  res.locals.errors = []

  try {
    const decoded = jwt.verify(req.cookies.ourSimpleApp, process.env.JWTSECRET)
    req.user = decoded
  } catch (err) {
    req.user = false
  }

  res.locals.user = req.user
  console.log(req.user)

  next()
})



// Funktionen

// Sicherstellung, dass Benutzer Admin ist
function mustBeAdmin(req, res, next) {
  if (req.user.userid == "1") {
    return next()
  }
  return res.redirect("/")
}

// Sicherstellung, dass Benutzer Schreiber ist
function mustBeWriter(req, res, next) {
  const searchWriter = db.prepare("SELECT writer FROM writers WHERE writer = ?")
  const writer = searchWriter.get(req.user.username)
  
  if (!writer && !(req.user.userid == "1")) {
    return res.redirect("/")
  } else {
    next()
  }
}

// Sicherstellung, dass Benutzer eingeloggt ist
function mustBeLoggedIn(req, res, next) {
  const loggedInStatement = db.prepare(`SELECT username FROM users WHERE id = ?`)
  const loggedIn = loggedInStatement.get(req.user.userid)
  const loggedInCheckFalse = !loggedIn

  if (loggedInCheckFalse) {
    return res.redirect("/account.ejs")
  } else {
    return next()
  }
}

// Überprüfung bei Artikelerstellung

// Kopiert aus Back-End-Tutorial von...
function sharedArticleValidation(req) {
  const errors = []

  if(typeof req.body.title !== "string") req.body.title = ""
  if(typeof req.body.article !== "string") req.body.article = ""

  // Schliessen von Sicherheitslücken
  req.body.title = sanitizeHTML(req.body.title.trim(), {allowedTags: [], allowedAttributes: {}})
  req.body.article = sanitizeHTML(req.body.article.trim(), {allowedTags: [], allowedAttributes: {}})

  // Vorgabenprüfung
  if (!req.body.title) errors.push("Titelfeld muss ausgefüllt sein.")
  if (!req.body.article) errors.push("Artikelfeld muss ausgefüllt sein.")
  if (req.body.title.length >= 30) errors.push("Titel darf nicht länger als 30 Zeichen sein.")
  return errors
  }

// Bildhochladefunktion
let whichPicture = ""
function logoPicture(req, res, next) {
  whichPicture = "logo"
  next()
}
function thumbnailPicture(req, res, next) {
  whichPicture = "thumbnail"
  next()
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (whichPicture === "logo") {
      cb(null, `pictures/logo`);
    }
    if (whichPicture === "thumbnail") {
      cb(null, 'pictures/articles');
    }
  },
  filename: function (req, file, cb) {
    if (whichPicture === "logo") {
      cb(null, `logo.jpg`)
    }
    if (whichPicture === "thumbnail") {
      cb(null, `${realArticle.id}.jpg`)
    }
  },
})
const upload = multer({storage})




// GET requests

// Hauptseite (neuster Artikel zuoberst)
app.get("/", (req, res) => {
  // Artikel auslesen
  const articlesStatement = db.prepare("SELECT * FROM articles ORDER BY createdDate DESC")
  const articles = articlesStatement.all()
  res.render("index", { articles })
})

// Hauptseite mit anderem GET-Request (neuster Artikel zuoberst)
app.get("/index.ejs", (req, res) => {
  // Artikel auslesen
  const articlesStatement = db.prepare("SELECT * FROM articles ORDER BY createdDate DESC")
  const articles = articlesStatement.all()

  res.render("index", { articles })
})

// Hauptseite (ältester Artikel zuoberst)
app.get("/oldest-index.ejs", (req, res) => {
  // Artikel auslesen
  const articlesStatement = db.prepare("SELECT * FROM articles ORDER BY createdDate ASC")
  const articles = articlesStatement.all()

  res.render("oldest-index", { articles })
})

// Hauptseite (beliebtester Artikel zuoberst)
app.get("/mostpopular-index.ejs", (req, res) => {
  // Artikel auslesen
  const articlesStatement = db.prepare("SELECT * FROM articles ORDER BY likes DESC")
  const articles = articlesStatement.all()

  res.render("mostpopular-index", { articles })
})

// Artikelwunschseite
app.get("/articlewish.ejs", (req, res) => {
  res.render("articlewish")
})

// Kontaktseite
app.get("/contact.ejs", (req, res) => {
  // Auslesen des echten Adminnamens
  searchAdmin = db.prepare("SELECT adminVisualName FROM adminVisualName WHERE id = 1")
  admin = searchAdmin.get()

  // Auslesen der Emailadresse des Admins
  searchAdminEmail = db.prepare("SELECT email FROM users WHERE Rowid = 1")
  adminEmail = searchAdminEmail.get()

  res.render("contact", {admin, adminEmail})
})

// Datenschutzseite
app.get("/data-protection.ejs", (req, res) => {
  // Echten Adminnamen auslesen
  searchAdmin = db.prepare("SELECT adminVisualName FROM adminVisualName WHERE id = 1")
  admin = searchAdmin.get()

  // Adminemail auslesen
  searchAdminEmail = db.prepare("SELECT email FROM users WHERE Rowid = 1")
  adminEmail = searchAdminEmail.get()

  res.render("data-protection", {admin, adminEmail})
})



// Accountseite
app.get("/account.ejs", (req, res) => {
  res.render("account")
})

// Loginseite
app.get("/login.ejs", (req, res) => {
  res.render("login")
})

// Registrierungsseite
app.get("/register.ejs", (req, res) => {
  res.render("register")
})



// Dashboardseite
app.get("/dashboard.ejs", (req, res) => {
  // Admin weiterleiten auf Admin-Dashboard
  if (req.user.userid == "1") {
    return res.redirect("dashboard-admin.ejs")
  }

  // Überprüfen, ob Benutzer Schreiber ist
  const searchWriter = db.prepare("SELECT writer FROM writers WHERE writer = ?")
  const writer = searchWriter.get(req.user.username)
  const isNotWriter = !writer

  // Email des Benutzer auslesen
  const emailStatement = db.prepare("SELECT email FROM users WHERE id = ?")
  const email = emailStatement.get(req.user.userid)

  res.render("dashboard", {isNotWriter, email})
})

// Emailändernseite
app.get("/change-email", (req, res) => {
  res.render("change-email")
})

// Passwortändernseite
app.get("/change-password", (req, res) => {
  res.render("change-password")
})

// Logout
app.get ("/logout", (req, res) => {
  // Cookie löschen
  res.clearCookie("ourSimpleApp")

  res.redirect("/account.ejs")
})



// Artikelerstellenseite
app.get("/create-article", mustBeWriter, (req, res) => {
  res.render("create-article")
})

// Artikelwunschlistenseite
app.get("/articlewishes-list.ejs", mustBeWriter, (req, res) => {
  // Artikelwünsche auslesen
  const articlewishStatement = db.prepare("SELECT * FROM articlewishes ORDER BY id ASC")
  const articlewishes = articlewishStatement.all()

  res.render("articlewishes-list", { articlewishes })
})



// Admin-Dashboardseite
app.get("/dashboard-admin.ejs", mustBeAdmin, (req, res) => {
  // Benutzernamen auslesen
  const userLookUp = db.prepare("SELECT * FROM users WHERE id = ?")
  const user = userLookUp.get(req.user.userid)

  // Email des Benutzers auslesen
  const emailStatement = db.prepare("SELECT email FROM users WHERE id = ?")
  const email = emailStatement.get(req.user.userid)
  
  res.render("dashboard-admin", {email, user})
})

// Logoändernseite
app.get("/change-logo.ejs", (req, res) => {
  res.render("change-logo")
})

// Schreiberlistenseite
app.get("/writers.ejs", mustBeAdmin, (req, res) => {
  // Schreiber auslesen
  const writerStatement = db.prepare("SELECT * FROM writers ORDER BY id ASC")
  const writers = writerStatement.all()

  res.render("writers", {writers})
})

// Benutzerlistenseite
app.get("/users.ejs", mustBeAdmin, (req, res) => {
  // Benutzer auslesen
  const usersStatement = db.prepare("SELECT * FROM users ORDER BY id ASC")
  const users = usersStatement.all()

  res.render("users", {users})
})

// Sicherheitsinformationsseite
app.get("/security-info.ejs", (req, res) => {
  res.render("security-info")
})




// Artikel öffnen
app.get("/article/:id", (req, res) => {
  // Artikel in Datenbank suchen
  const articleStatement = db.prepare("SELECT articles.*, users.username FROM articles INNER JOIN users ON articles.authorid = users.id WHERE articles.id = ?")
  const article = articleStatement.get(req.params.id)

  // Wenn Artikel nicht existiert, Weiterleitung zur Hauptseite
  if (!article) {
    return res.redirect("/")
  }

  // Überprüfung, ob Benutzer Autor des Artikels ist
  const isAuthor = article.authorid === req.user.userid
  const userid = req.user.userid

  // Likeanzahl auslesen
  const likesStatement = db.prepare(`SELECT likes FROM articles WHERE id = ?`)
  const likes = likesStatement.get(req.params.id)

  res.render("single-article", {article, isAuthor, userid, likes})
})

// "Artikel bearbeiten"-Seite
app.get("/edit-article/:id", mustBeWriter, (req, res) => {
  // Artikel auslesen
  const statement = db.prepare("SELECT * FROM articles WHERE id = ?")
  const article = statement.get(req.params.id)

  // Errorvermeidung bei manueller Abrufung eines Artikels über Suchbar
  if (!article) {
    return res.redirect("/")
  }

  // Überprüfung, ob Benutzer Autor (oder Admin) des Artikels ist
  if (article.authorid !== req.user.userid && req.user.userid !== 1) {
    return res.redirect("/")
  }

  res.render("edit-article", { article: article })
})





// POST requests

// Artikelwunsch eingereicht
app.post("/articlewish-input", (req, res) => {
  let errors = []
  
  // Wenn Emaileingabe weggelassen wurde, Platzhalter einsetzen
  if (!req.body.email) {
    req.body.email = "-"
  }
  // Errormeldung, wenn Artikelwunsch weggelassen wurde
  if (!req.body.articlewish) {
    errors = ["Artikelwunschfeld muss ausgefüllt sein."]
    return res.render("articlewish.ejs", {errors})
  } else {
    // Artikelwunsch abspeichern
    const saveArticlewish = db.prepare("INSERT INTO articlewishes (email, articlewish) VALUES (?, ?)")

    saveArticlewish.run(req.body.email, req.body.articlewish)
  }

  res.redirect("/articlewish.ejs")
})

// Registriert
app.post("/register", (req, res) => {
  // Errors
  const errors = []
  // Prüfung, ob alle Felder ausgefüllt sind
  if (req.body.email.trim() == "") {errors.push("Bitte Emailadresse eingeben."); return res.render("register", {errors})}
  if (req.body.username.trim() == "") {errors.push("Bitte Benutzername eingeben."); return res.render("register", {errors})}
  if (req.body.password.trim() == "") {errors.push("Bitte Passwort eingeben."); return res.render("register", {errors})}

  // Sicherheitslücke schliessen und potentielle Errormeldungen vermeiden
  if (typeof req.body.email !== "string") {req.body.email = ""; errors.push("Die Emailadresse muss Textformat haben."); return res.render("register", {errors})}
  if (typeof req.body.username !== "string") {req.body.username = ""; errors.push("Der Benutzername muss Textformat haben."); return res.render("register", {errors})}
  if (typeof req.body.password !== "string") {req.body.password = ""; errors.push("Das Passwort muss Textformat haben."); return res.render("register", {errors})}

  // Versehentliche Leerschläge am Anfang oder Ende entfernen
  req.body.username = req.body.username.trim()
  req.body.email = req.body.email.trim()

  // Email-, Benutzernamen und Passwortprüfung
  if (req.body.username.length == 1 || req.body.username.length == 2) {errors.push("Der Benutzername muss mindestens 3 Zeichen lang sein."); return res.render("register", {errors})}
  if (req.body.username.length > 20) {errors.push("Der Benutzername darf nicht länger als 20 Zeichen sein."); return res.render("register", {errors})}
  if (!req.body.username.match(/^[a-zA-Z0-9]+$/)) {errors.push("Nur Buchstaben und Zahlen sind erlaubt im Benutzernamen."); return res.render("register", {errors})}
  if (req.body.password.length == 1 && req.body.password.length == 2 && req.body.password.length == 3 && req.body.password.length == 4) {errors.push("Das Passwort muss mindestens 5 Zeichen lang sein."); return res.render("register", {errors})}

  // Versuchen, neuen Benutzer abzuspeichern -> falls Benutzername schon existiert -> Error -> springt zu catch {}
  try {
  // Passwort verschlüsseln
  const salt = bcrypt.genSaltSync(10)
  req.body.password = bcrypt.hashSync(req.body.password, salt)

  // Neuer Benutzer in Datenbank abspeichern
  const ourStatement = db.prepare("INSERT INTO users (email, username, password) VALUES (?, ?, ?)")
  const result = ourStatement.run(req.body.email, req.body.username, req.body.password)

  // Hinzugefügter Benutzer auslesen
  const lookupStatement = db.prepare("SELECT * FROM users WHERE ROWID = ?")
  const ourUser = lookupStatement.get(result.lastInsertRowid)

  // Server neustarten, um Datenbank zu aktualisieren
  let server = fork('server')
  server.on('close', (code) => {
    console.log("Restarted")
  });

  // Benutzer einloggen -> Cookie geben
  const ourTokenValue = jwt.sign({exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, skyColor: "blue", userid: ourUser.id, username: ourUser.username}, process.env.JWTSECRET)

  res.cookie("ourSimpleApp", ourTokenValue, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * 24
  })
  
  res.redirect("/dashboard.ejs")
  } catch {
    errors.push("Dieser Benutzername existiert schon."); return res.render("register", {errors})
  }
})

// Loginbutton gedrückt
app.post("/login", (req, res) => {
  const errors = []

  // Prüfung, ob alle Felder ausgefüllt sind
  if (req.body.username.trim() == "") {errors.push("Bitte Benutzername eingeben."); return res.render("login", {errors})}
  if (req.body.password.trim() == "") {errors.push("Bitte Passwort eingeben."); return res.render("login", {errors})}

  // Sicherheitslücke schliessen und potentielle Errormeldungen vermeiden
  if (typeof req.body.username !== "string") {req.body.username = ""; errors.push("Der Benutzername muss Textformat haben."); return res.render("login", {errors})}
  if (typeof req.body.password !== "string") {req.body.password = ""; errors.push("Das Passwort muss Textformat haben."); return res.render("login", {errors})}

  // Eingegebenen Benutzernamen in Datenbank suchen
  const userInQuestionStatement = db.prepare("Select * FROM users WHERE username = ?")
  const userInQuestion = userInQuestionStatement.get(req.body.username)

  // Vorhandensein des Benutzernamens prüfen
  if (!userInQuestion) {
    errors.push("Invalieder Benutzername")
    return res.render("login", {errors})
  }

  // Richtigkeit des Passwort prüfen
  const matchOrNot = bcrypt.compareSync(req.body.password, userInQuestion.password)
  if (!matchOrNot) {
    errors.push("Invaliedes Passwort")
    return res.render("login", {errors})
  }

  // Benutzer einloggen -> Cookie geben
  const ourTokenValue = jwt.sign({exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, skyColor: "blue", userid: userInQuestion.id, username: userInQuestion.username}, process.env.JWTSECRET)

  res.cookie("ourSimpleApp", ourTokenValue, {
    httpOnly: true,
    secure: false,
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * 24
  })

  res.redirect("/")
})


// Emailadresse geändert
app.post("/change-email", (req, res) => {
  const errors = []

  // Versehentliche Leerschläge am Anfang oder am Ende entfernen
  req.body.newemail = req.body.newemail.trim()
  // Prüfung der neuen Emailadresse
  if (typeof req.body.newemail !== "string") {req.body.email = ""; errors.push("Die Emailadresse muss Textformat haben."); return res.render("change-email", {errors})}
  else if (!req.body.newemail) {errors.push("Es muss eine Emailadresse eingegeben werden."); return res.render("change-email", {errors})}

  // Alte Emailadresse durch Neue ersetzen in der Datenbank
  const changeEmailStatement = db.prepare("UPDATE users SET email = ? WHERE id = ?")
  changeEmailStatement.run(req.body.newemail, req.user.userid)

  // Server neu Starten, um Datenbank zu aktualisieren
  let server = fork('server')
  server.on('close', (code) => {
    console.log("Restarted")
  });
  return res.redirect("/dashboard.ejs")
})

// Passwort geändert
app.post("/change-password", (req, res) => {
  const errors = []

  // Prüfung des neuen Passworts
  if (req.body.newpassword !== req.body.newpasswordcheck) {
    errors.push("Passwörter stimmen nicht überein.")
    return res.render("change-password", {errors})

  } else if (req.body.newpassword == "") {
    errors.push("Es muss ein Passwort eingegeben werden.")
    return res.render("change-password", {errors})
    
  } else {
    // Neues Passwort verschlüsseln
    const salt = bcrypt.genSaltSync(10)
    req.body.newpassword = bcrypt.hashSync(req.body.newpassword, salt)
    // Altes Passwort durch Neues ersetzen
    const changeStatement = db.prepare("UPDATE users SET password = ? WHERE id = ?")
    changeStatement.run(req.body.newpassword, req.user.userid)

    return res.redirect("dashboard-admin.ejs")
  }
})

// Artikel geliket
app.post("/like-article/:id", mustBeLoggedIn, (req, res) => {
  // Auslesen, ob der Benutzer Artikel schon geliket hat
  const alreadyLikedStatement = db.prepare(`SELECT likedArticles FROM ${req.user.username} WHERE likedArticles = ?`)
  const alreadyLiked = alreadyLikedStatement.get(req.params.id)
  const alreadyLikedCheckFalse = !alreadyLiked

  if (alreadyLikedCheckFalse) {
    // Like hinzufügen
    const addLike = db.prepare(`UPDATE articles SET likes = likes + 1 WHERE id = ?`)
    addLike.run(req.params.id)

    // Abspeichern, dass dieser Benutzer Artikel geliket hat
    saveLikingUser = db.prepare(`INSERT INTO ${req.user.username} (likedArticles) VALUES (?)`)
    saveLikingUser.run(req.params.id)
  } else {
    // Like entfernen
    const removeLike = db.prepare(`UPDATE articles SET likes = likes - 1 WHERE id = ?`)
    removeLike.run(req.params.id)

    // Abspeichern, dass dieser Benutzer Artikel nicht mehr geliket hat
    removeLikingUser = db.prepare(`DELETE FROM ${req.user.username} WHERE likedArticles = ?`)
    removeLikingUser.run(req.params.id)
  }
  
  res.redirect(`/article/${req.params.id}`)
})

// Artikel veröffentlicht

// Artikelid zwischenspeichern
let realArticle = ""

app.post("/create-article", mustBeWriter, (req, res) => {
  // Prüfung des Artikels
  const errors = sharedArticleValidation(req)

  // Wenn Prüfung nicht erfüllt -> Error
  if (errors.length) {
    return res.render("create-article", { errors })
  }

  // Artikel in Datenbank speichern
  const ourStatement = db.prepare("INSERT INTO articles (title, article, likes, authorid, createdDate) VALUES (?, ?, 0, ?, ?)")
  const result = ourStatement.run(req.body.title, req.body.article, req.user.userid, new Date().toISOString())

  // Hinzugefügter Artikel auslesen
  const getArticleStatement = db.prepare("SELECT * FROM articles WHERE ROWID = ?")
  realArticle = getArticleStatement.get(result.lastInsertRowid)
  
  res.render("upload-picture")
})


// Titelbild hochgeladen
app.post("/save-picture", mustBeWriter, thumbnailPicture, upload.single("picture"), (req, res) => {
  // Weiterleitung zum gerade erstellten Artikel
  return res.redirect(`/article/${realArticle.id}`)
})

// Artikel bearbeitet und veröffentlicht

app.post("/edit-article/:id", mustBeWriter, (req, res) => {
  // Artikel in Datenbank suchen
  const statement = db.prepare("SELECT * FROM articles WHERE id = ?")
  const article = statement.get(req.params.id)

  // Wenn Artikel nicht vorhanden -> Weiterleitung zur Hauptseite
  if (!article) {
    return res.redirect("/")
  }

  // Prüfung, ob Benutzer Autor dieses Artikels oder Admin ist
  if (article.authorid !== req.user.userid && req.user.userid !== 1) {
    return res.redirect("/")
  }

  // Prüfung des Artikels
  const errors = sharedArticleValidation(req)

  // Wenn Prüfung nicht erfüllt -> Error
  if (errors.length) {
    return res.render("edit-article", { errors })
  }

  // Alter Artikel durch Neuen ersetzen
  const updateStatement = db.prepare("UPDATE articles SET title = ?, article = ? WHERE id = ?")
  updateStatement.run(req.body.title, req.body.article, req.params.id)

  res.redirect(`/article/${req.params.id}`)
})


// Artikel gelöscht

app.post("/delete-article/:id", mustBeWriter, (req, res) => {
  // Artikel in Datenbank suchen
  const statement = db.prepare("SELECT * FROM articles WHERE id = ?")
  const article = statement.get(req.params.id)

  // Wenn Artikel nicht vorhanden -> Weiterleitung zur Hauptseite
  if (!article) {
    return res.redirect("/")
  }

  // Prüfung, ob Benutzer Autor dieses Artikels oder Admin ist
  if (article.authorid !== req.user.userid && req.user.userid !== 1) {
    return res.redirect("/")
  }

  // Artikel aus Datenbank löschen
  const deleteStatement = db.prepare("DELETE FROM articles WHERE id = ?")
  deleteStatement.run(req.params.id)

  res.redirect("/")
})


// Logo hochgeladen
app.post("/upload-logo", mustBeWriter, logoPicture, upload.single("logo"), (req, res) => {
  return res.redirect("/")
})

// Echter Adminname geändert
app.post("/admin-visual-name", mustBeAdmin, (req, res) => {
  // Alter Name durch Neuen ersetzen
  const adminVisualNameStatement = db.prepare("UPDATE adminVisualName SET adminVisualName = ? WHERE id = 1")
  adminVisualNameStatement.run(req.body.adminVisualName)

  res.redirect("/dashboard-admin.ejs")
})

// Schreiber hinzugefügt
app.post("/add-writer", mustBeAdmin, (req, res) => {
  // Wenn Feld leer -> Seite lädt neu
  if (!req.body.addwriter) {
    return res.redirect("dashboard-admin.ejs")
  } else {
    // Schreiber in Datenbank abspeichern
    const ourStatement = db.prepare("INSERT INTO writers (writer) VALUES (?)")
    ourStatement.run(req.body.addwriter)

    res.redirect("dashboard-admin.ejs")
  }
})

// Schreiber entfernt
app.post("/remove-writer", mustBeAdmin, (req, res) => {
  // Schreiber aus Datenbank entfernen
  const deleteStatement = db.prepare("DELETE FROM writers WHERE writer = ?")
  deleteStatement.run(req.body.removewriter)

  res.redirect("dashboard-admin.ejs")
})



// Server starten
app.listen(3000)