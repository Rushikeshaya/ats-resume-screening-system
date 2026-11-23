// English stop-word list (compact, similar in spirit to scikit-learn's "english" list).
const STOP = new Set(
  `a about above after again all also am an and any are as at be because been before being below
   between both but by can could did do does doing down during each few for from further had has have
   having he her here hers him his how i if in into is it its just me more most my no nor not now of
   off on once only or other our out over own same she should so some such than that the their them
   then there these they this those through to too under until up very was we were what when where
   which while who whom why will with would you your yours`
    .split(/\s+/)
    .filter(Boolean)
);

// Extra words that are frequent in resumes but carry no topical meaning (used for topic modelling only).
const RESUME_NOISE = new Set(
  `using used use work worked working developed developing built build project projects experience
   skills responsible team also including university college year years intern internship github
   email phone linkedin cgpa present current well new based various like`
    .split(/\s+/)
    .filter(Boolean)
);

module.exports = { STOP, RESUME_NOISE };
