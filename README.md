# Retrace

> **AI-powered CI failure classification — understand why your tests failed, not just that they failed.**

Retrace analyzes failed CI test output and classifies the failure into categories such as **real regressions** and **external dependencies**, helping developers understand what happened without manually digging through logs.

## 🚀 Why Retrace?

CI failures are noisy.

A failed test does not always mean your code is broken. It could be caused by:

- A real regression in application logic
- An external API or service
- Network problems
- Temporary infrastructure issues
- Other environmental factors

Retrace uses AI to analyze the failure context and provide a clear classification with a confidence score.

Instead of spending time asking *"Why did CI fail?"*, Retrace gives you a starting point immediately.

## ✨ Key Features

- 🤖 **AI-powered failure classification**
- 📊 **Confidence scores** for classifications
- 🔍 **Analyzes test output and failure context**
- 💬 **Posts classifications directly to GitHub pull requests**
- ⚙️ **GitHub Actions integration**
- 🚀 **Designed for automated CI workflows**

## 🧠 How It Works

```text
GitHub Actions
      ↓
Run tests
      ↓
Test fails
      ↓
Capture failure output
      ↓
Send failure to Retrace
      ↓
AI analyzes the failure
      ↓
Classification + confidence
      ↓
Post result to the Pull Request
```

## 🧪 Example

Retrace can analyze a deterministic regression such as:

```text
Expected: 1260
Received: 1400
```

and classify it as:

```text
likely real regression
Confidence: 95%
```

Example explanation:

> The test deterministically expects a total of 1260 but receives 1400, indicating a change in application logic rather than timing or external factors.

## ⚙️ GitHub Actions Integration

Retrace can be integrated directly into a GitHub Actions workflow.

👉 **[Retrace GitHub Actions Integration](https://github.com/thuluxx/retrace-test)**

The integration workflow:

1. Checks out the repository
2. Sets up Node.js
3. Installs dependencies
4. Runs the tests
5. Sends the failure output to Retrace
6. Receives the AI classification
7. Posts the classification as a PR comment
8. Fails the workflow if the tests failed

Workflow file:

```text
.github/workflows/retrace-classify.yml
```

## 🏗️ Architecture

```text
                 ┌──────────────────┐
                 │   GitHub PR      │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ GitHub Actions   │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │     Run Tests    │
                 └────────┬─────────┘
                          │
                    Test failure
                          │
                          ▼
                 ┌──────────────────┐
                 │     Retrace      │
                 │  Failure Analysis│
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ AI Classification│
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ PR Comment +     │
                 │ Confidence Score │
                 └──────────────────┘
```

## 🛠️ Built With

- JavaScript
- Node.js
- Jest
- GitHub Actions
- GitHub
- REST API
- AI

## 📂 GitHub Actions Demo

The companion repository contains a working example of the GitHub Actions integration:

👉 **https://github.com/thuluxx/retrace-test**

It demonstrates how Retrace can automatically classify a failing test inside a real CI workflow.

## 🎯 Why Retrace?

Traditional CI tells you:

```text
❌ Test failed
```

Retrace aims to tell you:

```text
❌ Test failed

Classification:
likely real regression

Confidence:
95%

Reason:
The failure is deterministic and indicates a
change in application logic.
```

That extra context helps developers decide what to investigate first.

## 🗺️ Roadmap

- [x] AI-powered CI failure classification
- [x] GitHub Actions integration
- [x] Automated PR comments
- [x] Confidence scoring
- [ ] More failure categories
- [ ] Improved failure explanations
- [ ] Support for more CI platforms
- [ ] Historical failure tracking
- [ ] Team-level analytics

## 🤝 Project

Retrace was built as a project focused on making CI failures easier to understand and act on.

For the GitHub Actions integration and demo, see:

👉 **https://github.com/thuluxx/retrace-test**
