export default `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Error - {{error}}</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family:
          -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
          Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(
          135deg,
          #1a1a2e 0%,
          #16213e 50%,
          #0f0f23 100%
        );
        color: #fff;
        padding: 20px;
      }

      .error-container {
        max-width: 500px;
        width: 100%;
        text-align: center;
        animation: fadeIn 0.5s ease-out;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .error-icon {
        width: 120px;
        height: 120px;
        margin: 0 auto 30px;
        background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 10px 40px rgba(238, 90, 90, 0.3);
      }

      .error-icon svg {
        width: 60px;
        height: 60px;
        fill: #fff;
      }

      .error-card {
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 40px 30px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }

      .error-title {
        font-size: 1.5rem;
        font-weight: 600;
        color: #ff6b6b;
        margin-bottom: 8px;
        text-transform: capitalize;
      }

      .error-code {
        font-size: 0.875rem;
        color: rgba(255, 255, 255, 0.5);
        font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
        margin-bottom: 20px;
        padding: 6px 12px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        display: inline-block;
      }

      .error-description {
        font-size: 1rem;
        color: rgba(255, 255, 255, 0.8);
        line-height: 1.6;
        margin-bottom: 30px;
      }

      .error-actions {
        display: flex;
        gap: 12px;
        justify-content: center;
        flex-wrap: wrap;
      }

      .btn {
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        text-decoration: none;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
      }

      .btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #fff;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
      }

      .btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
      }

      .btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }

      .btn-secondary:hover {
        background: rgba(255, 255, 255, 0.15);
        transform: translateY(-2px);
      }

      .footer-text {
        margin-top: 30px;
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.3);
      }
    </style>
  </head>
  <body>
    <div class="error-container">
      <div class="error-icon">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
          />
        </svg>
      </div>
      <div class="error-card">
        <h1 class="error-title">Something went wrong</h1>
        <div class="error-code">{{error}}</div>
        <p class="error-description">{{error_description}}</p>
        <div class="error-actions">
          <a href="javascript:history.back()" class="btn btn-secondary"
            >Go Back</a
          >
          <a href="/" class="btn btn-primary">Return Home</a>
        </div>
      </div>
      <p class="footer-text">OpenAuthster</p>
    </div>
  </body>
</html>
`;
