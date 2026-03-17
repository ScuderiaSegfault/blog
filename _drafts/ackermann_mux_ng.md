---
layout: post
title: "AckermannMuxNG"
excerpt_separator: <!--more-->
author: Felix Resch <felix.resch@tuwien.ac.at>
---

One of the things we noticed after our switch to ROS2 were spurious, uncommanded movements of our car, even when the Dead-man-switch was definitely not pressed.
First, we suspected that the controllers had issues and developed a new solution for our cars, which resulted in our new [Radio Controllers]({% post_url 2026-03-17-radio-controller %}).
But even with the new controllers, we continued to experience those issues.

We narrowed the issue down to an implementation issue, caused by ROS timing issues.
In some high-load situations the stop (zero speed) message from the `joy_teleop` arrived late to the `ackermann_mux`, which in turn forwarded one of the autonomous controllers, leading to the spurios controls.
While this issue was caused mainly by communication delays, the same behavior could also occur if `joy_node` or `joy_teleop` fail.
In the latter case, the failure would be permanent, leading to a full loss-of-control.

To mitigate this issue, we attempted to fix the `ackermann_mux` implementation but quickly decided to rewrite the implementation.
In this rewrite we also tried using [Rust](https://rust-lang.org/) with ROS2.
The key benefits of our new implementation are:

* **Fail-safe implementation** Stop if no input from the controller is received.
* **Include the input (`joy_teleop`) in the node** Single point that processes the controller input
* **Optimize the input &rarr; control latency** Simplify the implementation to reduce latency
* **Integration with [T2V Module]({% post_url 2026-03-17-t2v-module %})** 

Installation
---

Before you can install `ackermann_mux_ng`, you need to install:

* **Rust** - Installation via [rustup](https://rustup.rs/)
* **ros2_rust:0.6.0** - See [ros2_rust](https://github.com/ros2-rust/ros2_rust) for Installation details

Clone the `ackermann_mux_ng` repository

```bash
git clone https://github.com/ScuderiaSegfault/ackermann_mux_ng.git
```

and build the node. This will also build other nodes, so it might take a bit

```bash
colcon build --cargo-args " --release"
```

To use the node, remove the nodes `joy_teleop` and `ackermann_mux_ng` from the `bringup_launch.py` from the `f1tenth_stack` launch file.
Add the `ackermann_mux_ng` and update the mappings, if necessary.
The new version of the `ackermann_mux_ng` is a plugin replacement for the two previous nodes, but some remapping is necessary.

Then you need to update the configuration for your setup.
The default configuration uses the new remotes and `/drive` and `/backup_drive` topics, for the main and backup controller, respectively.

Configuration
---

To configure the node, a TOML configuration is used, that describes the behavior of the mux and dynamic input configurations.
The path to the configuration is provided as a read only string parameter with a default value of ackermann_mux.toml.


General configuration of the mux is placed in the dictionary mux in the configuration file and configures the timeout and enable configuration for the autonomous control.
The following configuration enables autonomous control when the button with index is pressed with a timeout of 100ms.

```toml
[mux]
autonomous_control = { button = 2 }
timeout = { msec = 100 }
```

The enable expressions consist of the following structures to build any propositional logical formula on the base of button presses on the joy stick.
They can be arbitrarily combined and with some formula transformations represent all possible propositional logic formulas.

```toml
[example]
and = { and = [ { button = 1 }, { button = 2 }]}    # evaluates to true if all conditions are true
not = { not = { button = 1 }}     # inverts the inner expression
or = { or = [{ button = 1 }, { button = 2 }]}     # evaluates to true if any condition is true
```

The mux can optionally be configured to employ stop steering, by providing the mux.stop_steering configuration dictionary.
To use the input received at topic /backup_drive for steering over a velocity of 0.2, use the following configuration.
During stop steering the mux outputs the steering commands of the selected ackermann drive input with a configurable braking current.

```toml
[mux.stop_steering]
input = "/backup_drive"
speed_threshold = 0.2
```

To configure a manual input, an entry to the manual array is added.
Adding two brackets to a top-level entry in TOML marks this entry as an item of a top-level array.
The following configuration defines a manual input that is enabled when button 3 is pressed and which uses axis 1 for determining the steering and axis 2 for speed control.
The control uses a priority of 10.

```toml
[[manual]]
enable = { button = 3 }
output = [
    {steering = {joy_stick = {axis = 1, scale = 1.0}}},
    {speed = {joy_stick = { axis = 2, scale = 2.0}}},
    {acceleration = { value = 0.0 }},
]
priority = 10
```

The expressions used for the output are similar to the enable expressions.
Each entry in the array writes into one value of the ackermann drive message and can either use an axis from the joystick or a fixed value for the field.
Available fields (for now) are:

* speed
* steering
* acceleration

Manual control inputs are slightly simpler, as they require less information for the routing.
To add an input that listens on the topic /drive with a priority of 10, and a timeout of 100ms, add the following configuration.

```toml
[[input]]
topic = "/drive"
priority = 10
timeout = { msecs = 100 }
```

**NOTE**: Priorities for manual control and ackermann drive inputs are distinct. Manual control, regardless of priority, will always override ackermann drive inputs.
