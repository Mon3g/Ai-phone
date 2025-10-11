from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # Navigate to the dashboard page
            page.goto("http://localhost:5173/login")

            # Fill in the login form
            page.get_by_label("Email").fill("test@example.com")
            page.get_by_label("Password").fill("password")
            page.get_by_role("button", name="Login").click()

            # Wait for navigation to the dashboard
            expect(page).to_have_url("http://localhost:5173/")

            # Wait for the dashboard header to be visible
            dashboard_header = page.get_by_role("heading", name="Dashboard")
            expect(dashboard_header).to_be_visible(timeout=10000) # Increased timeout

            # Take a screenshot of the entire page
            page.screenshot(path="jules-scratch/verification/dashboard_redesign.png")
            print("Screenshot saved to jules-scratch/verification/dashboard_redesign.png")

        except Exception as e:
            print(f"An error occurred: {e}")
            # Save a screenshot even if it fails to see the state
            page.screenshot(path="jules-scratch/verification/error_screenshot.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run_verification()